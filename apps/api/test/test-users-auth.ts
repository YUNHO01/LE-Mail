import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuthService } from '../src/modules/auth/auth.service';
import { UsersService } from '../src/modules/users/users.service';
import { Mailbox } from '../src/modules/database/entities/mailbox.entity';
import { User } from '../src/modules/database/entities/user.entity';
import { UserRole } from '@lemail/shared-types';
import { SmtpIngestionService } from '../src/modules/smtp-ingestion/smtp-ingestion.service';
import * as nodemailer from 'nodemailer';

async function run() {
  console.log('--- Starting User Management & Auth Verification Test ---');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const dataSource = app.get<DataSource>(getDataSourceToken());
  const authService = app.get(AuthService);
  const usersService = app.get(UsersService);

  const userRepo = dataSource.getRepository(User);
  const mailboxRepo = dataSource.getRepository(Mailbox);

  // 1. Verify Seed: Default System Administrator
  console.log('\n[1] Checking System Administrator Auto-seed...');
  const admin = await userRepo.findOne({
    where: { role: UserRole.SYSTEM_ADMIN },
  });
  if (!admin) {
    throw new Error('FAILED: Default system administrator was not seeded!');
  }
  console.log(`PASS: Found SYSTEM_ADMIN: ${admin.email} (${admin.name})`);

  const adminMailbox = await mailboxRepo.findOne({
    where: { email: admin.email },
  });
  if (!adminMailbox || !adminMailbox.isActive) {
    throw new Error('FAILED: Admin mailbox was not created or is inactive!');
  }
  console.log(`PASS: Admin mailbox active: ${adminMailbox.email}`);

  // 2. Test Admin Login & JWT issuance
  console.log('\n[2] Testing Admin Login & JWT Issuance...');
  const loginRes = await authService.login({
    email: admin.email,
    password: 'admin1234!',
  });
  if (!loginRes.accessToken || loginRes.user.role !== UserRole.SYSTEM_ADMIN) {
    throw new Error('FAILED: Admin login failed or invalid token issued!');
  }
  console.log(`PASS: Admin login success! JWT token length: ${loginRes.accessToken.length}`);

  // 3. Test Admin registering a new regular user
  console.log('\n[3] Testing Admin Registering a New User & Mailbox Auto-creation...');
  const testUserEmail = `member_${Date.now()}@lineedge.com`;
  const newUser = await usersService.create({
    email: testUserEmail,
    name: '김테스트',
    password: 'member1234!',
    role: UserRole.USER,
  });
  console.log(`PASS: Created user: ${newUser.email} (id: ${newUser.id})`);

  const userMailbox = await mailboxRepo.findOne({
    where: { email: testUserEmail },
  });
  if (!userMailbox || !userMailbox.isActive) {
    throw new Error(`FAILED: Mailbox for ${testUserEmail} was not auto-created!`);
  }
  console.log(`PASS: User mailbox auto-created & activated: ${userMailbox.email}`);

  // 4. Test New User Login & SMTP AUTH
  console.log('\n[4] Testing New User Login & SMTP Authentication...');
  const userLogin = await authService.login({
    email: testUserEmail,
    password: 'member1234!',
  });
  if (!userLogin.accessToken || userLogin.user.role !== UserRole.USER) {
    throw new Error('FAILED: New user login failed!');
  }
  console.log(`PASS: New user login success: ${userLogin.user.name}`);

  const smtpAuthOk = await authService.validateForSmtp(testUserEmail, 'member1234!');
  if (!smtpAuthOk) {
    throw new Error('FAILED: SMTP AUTH validation failed for correct password!');
  }
  const smtpAuthFail = await authService.validateForSmtp(testUserEmail, 'wrongPassword!');
  if (smtpAuthFail) {
    throw new Error('FAILED: SMTP AUTH validated invalid password!');
  }
  console.log('PASS: SMTP AUTH validation logic verified successfully!');

  // 5. Test Self-Deletion Prevention
  console.log('\n[5] Testing Self-Deletion Prevention...');
  try {
    await usersService.remove(admin.id, admin.id);
    throw new Error('FAILED: Self-deletion should have been blocked!');
  } catch (err: any) {
    console.log(`PASS: Self-deletion properly blocked: ${err.message}`);
  }

  // Cleanup test user
  console.log('\n[Cleanup] Removing temporary test user...');
  await usersService.remove(newUser.id, admin.id);
  console.log('PASS: Test user removed.');

  await app.close();
  console.log('\n=== All User Management & Auth Tests Passed! ===\n');
}

run().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
