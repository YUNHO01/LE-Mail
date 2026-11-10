import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { validationSchema } from './config/validation.schema';
import { DatabaseModule } from './modules/database/database.module';
import { QueueModule } from './modules/queue/queue.module';
import { SmtpIngestionModule } from './modules/smtp-ingestion/smtp-ingestion.module';
import { WorkerPoolModule } from './modules/worker-pool/worker-pool.module';
import { DomainModule } from './modules/domain/domain.module';
import { MailboxModule } from './modules/mailbox/mailbox.module';
import { MailModule } from './modules/mail/mail.module';
import { MonitoringModule } from './modules/monitoring/monitoring.module';
import { SeedModule } from './modules/seed/seed.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { MailFolderModule } from './modules/mail-folder/mail-folder.module';
import { SettingsModule } from './modules/settings/settings.module';
import { SpamModule } from './modules/spam/spam.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CryptoModule } from './common/crypto/crypto.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', 'apps/api/.env'],
      load: [configuration],
      validationSchema,
    }),
    CryptoModule,
    DatabaseModule,
    QueueModule,
    SmtpIngestionModule,
    WorkerPoolModule,
    DomainModule,
    MailboxModule,
    MailModule,
    MonitoringModule,
    AuthModule,
    UsersModule,
    MailFolderModule,
    SettingsModule,
    SpamModule,
    SeedModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
