import { Module, forwardRef } from '@nestjs/common';
import { SmtpIngestionService } from './smtp-ingestion.service';
import { MailboxCacheService } from './mailbox-cache.service';
import { QueueModule } from '../queue/queue.module';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [QueueModule, DatabaseModule, forwardRef(() => AuthModule)],
  providers: [SmtpIngestionService, MailboxCacheService],
  exports: [SmtpIngestionService, MailboxCacheService],
})
export class SmtpIngestionModule {}
