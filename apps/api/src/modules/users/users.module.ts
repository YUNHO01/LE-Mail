import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User, Mailbox } from '../database/entities';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { SmtpIngestionModule } from '../smtp-ingestion/smtp-ingestion.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Mailbox]),
    SmtpIngestionModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
