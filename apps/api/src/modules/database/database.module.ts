import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  Mailbox,
  MailMessage,
  MailRecipient,
  MailAttachment,
  User,
} from './entities';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const poolSize = configService.get<number>('database.poolSize') || 20;
        return {
          type: 'mysql',
          host: configService.get<string>('database.host'),
          port: configService.get<number>('database.port'),
          username: configService.get<string>('database.username'),
          password: configService.get<string>('database.password'),
          database: configService.get<string>('database.database'),
          entities: [Mailbox, MailMessage, MailRecipient, MailAttachment, User],
          synchronize: false,
          timezone: 'Z',
          extra: {
            connectionLimit: poolSize,
          },
        };
      },
    }),
    TypeOrmModule.forFeature([
      Mailbox,
      MailMessage,
      MailRecipient,
      MailAttachment,
      User,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
