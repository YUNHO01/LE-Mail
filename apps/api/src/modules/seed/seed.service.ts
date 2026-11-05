import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { User } from '../database/entities/user.entity';
import { Mailbox } from '../database/entities/mailbox.entity';
import { UserRole } from '@lemail/shared-types';
import { MailboxCacheService } from '../smtp-ingestion/mailbox-cache.service';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Mailbox)
    private readonly mailboxRepository: Repository<Mailbox>,
    private readonly configService: ConfigService,
    private readonly mailboxCacheService: MailboxCacheService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.seedSystemAdmin();
  }

  async seedSystemAdmin(): Promise<void> {
    try {
      const adminExists = await this.userRepository.findOne({
        where: { role: UserRole.SYSTEM_ADMIN },
      });

      const adminEmail =
        this.configService.get<string>('defaultAdmin.email') || 'admin@lineedge.com';
      const adminPassword =
        this.configService.get<string>('defaultAdmin.password') || 'admin1234!';
      const adminName =
        this.configService.get<string>('defaultAdmin.name') || '시스템관리자';

      if (!adminExists) {
        this.logger.log(`No SYSTEM_ADMIN found. Initializing default admin: ${adminEmail}`);

        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(adminPassword, saltRounds);

        const newAdmin = this.userRepository.create({
          email: adminEmail,
          passwordHash,
          name: adminName,
          role: UserRole.SYSTEM_ADMIN,
          isActive: true,
        });

        await this.userRepository.save(newAdmin);
        this.logger.log(`Default SYSTEM_ADMIN created successfully: ${adminEmail}`);
      } else {
        this.logger.log(`SYSTEM_ADMIN already exists: ${adminExists.email}`);
      }

      // Ensure mailbox for admin exists
      const domain = adminEmail.split('@')[1] || 'lineedge.com';
      let mailbox = await this.mailboxRepository.findOne({
        where: { email: adminEmail },
      });

      if (!mailbox) {
        mailbox = this.mailboxRepository.create({
          email: adminEmail,
          domain,
          isActive: true,
        });
        await this.mailboxRepository.save(mailbox);
        this.logger.log(`Admin mailbox created: ${adminEmail}`);
      }

      await this.mailboxCacheService.invalidate();
    } catch (err: any) {
      this.logger.error(`Failed to seed system administrator: ${err.message}`, err.stack);
    }
  }
}
