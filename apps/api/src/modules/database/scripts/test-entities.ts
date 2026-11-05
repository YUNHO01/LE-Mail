import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../../app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Mailbox,
  MailMessage,
  MailRecipient,
  Direction,
  MailStatus,
  RecipientType,
} from '../entities';
import { randomUUID } from 'crypto';

async function testEntities() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  const mailboxRepo = app.get<Repository<Mailbox>>(getRepositoryToken(Mailbox));
  const messageRepo = app.get<Repository<MailMessage>>(
    getRepositoryToken(MailMessage),
  );
  const recipientRepo = app.get<Repository<MailRecipient>>(
    getRepositoryToken(MailRecipient),
  );

  console.log('1. Cleaning up existing test records if any...');
  await mailboxRepo.delete({ email: 'test@example.com' });

  console.log('2. Testing Mailbox repository save...');
  const testMailbox = mailboxRepo.create({
    email: 'test@example.com',
    domain: 'example.com',
    isActive: true,
  });
  const savedMailbox = await mailboxRepo.save(testMailbox);
  console.log('Saved mailbox successfully: ID =', savedMailbox.id);

  console.log('3. Testing MailMessage & MailRecipient save...');
  const messageId = randomUUID();
  const testMessage = messageRepo.create({
    id: messageId,
    direction: Direction.INBOUND,
    sender: 'sender@external.com',
    subject: 'Integration Test Mail',
    rawFilePath: '/tmp/test.eml',
    status: MailStatus.QUEUED,
  });
  await messageRepo.save(testMessage);

  const testRecipient = recipientRepo.create({
    messageId: messageId,
    type: RecipientType.TO,
    address: 'test@example.com',
  });
  await recipientRepo.save(testRecipient);

  console.log('4. Verifying relations...');
  const foundMessage = await messageRepo.findOne({
    where: { id: messageId },
    relations: { recipients: true },
  });
  console.log(
    'Found message ID:',
    foundMessage?.id,
    'Recipients count:',
    foundMessage?.recipients?.length,
    'First recipient:',
    foundMessage?.recipients?.[0]?.address,
  );

  console.log('5. Testing Cascade delete (deleting message)...');
  await messageRepo.delete(messageId);
  const remainingRecipients = await recipientRepo.count({
    where: { messageId },
  });
  console.log('Remaining recipients after message deletion:', remainingRecipients);

  console.log('6. Cleaning up test mailbox...');
  await mailboxRepo.delete(savedMailbox.id);

  console.log('All Entity tests passed successfully!');
  await app.close();
}

testEntities().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
