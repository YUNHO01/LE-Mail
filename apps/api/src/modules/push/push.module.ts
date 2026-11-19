import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Domain,
  MailFolder,
  MailMessage,
  PushSubscription,
  SystemSetting,
  User,
} from '../database/entities';
import { CryptoModule } from '../../common/crypto/crypto.module';
import { PushController } from './push.controller';
import { PushService } from './push.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PushSubscription,
      User,
      MailFolder,
      MailMessage,
      SystemSetting,
      Domain,
    ]),
    CryptoModule,
  ],
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
