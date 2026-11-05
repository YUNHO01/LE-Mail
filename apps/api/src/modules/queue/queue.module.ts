import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { InboundMailProducer } from './inbound-mail.producer';
import { InboundMailProcessor } from './inbound-mail.processor';
import { INBOUND_MAIL_QUEUE_NAME } from './interfaces/inbound-mail.interface';
import { WorkerPoolModule } from '../worker-pool/worker-pool.module';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('redis.host'),
          port: configService.get<number>('redis.port'),
          password: configService.get<string>('redis.password') || undefined,
        },
      }),
    }),
    BullModule.registerQueue({
      name: INBOUND_MAIL_QUEUE_NAME,
    }),
    WorkerPoolModule,
    DatabaseModule,
  ],
  providers: [InboundMailProducer, InboundMailProcessor],
  exports: [BullModule, InboundMailProducer],
})
export class QueueModule {}
