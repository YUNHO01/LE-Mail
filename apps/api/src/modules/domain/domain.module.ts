import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Domain } from '../database/entities/domain.entity';
import { Mailbox } from '../database/entities/mailbox.entity';
import { DomainController } from './domain.controller';
import { DomainService } from './domain.service';
import { SmtpIngestionModule } from '../smtp-ingestion/smtp-ingestion.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Domain, Mailbox]),
    SmtpIngestionModule,
  ],
  controllers: [DomainController],
  providers: [DomainService],
  exports: [DomainService],
})
export class DomainModule {}
