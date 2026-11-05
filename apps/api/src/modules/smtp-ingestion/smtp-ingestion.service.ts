import {
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SMTPServer,
  SMTPServerSession,
  SMTPServerDataStream,
  SMTPServerAddress,
  SMTPServerAuthentication,
  SMTPServerAuthenticationResponse,
} from 'smtp-server';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import { randomUUID } from 'crypto';
import { InboundMailProducer } from '../queue/inbound-mail.producer';
import { MailboxCacheService } from './mailbox-cache.service';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class SmtpIngestionService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private server: SMTPServer;
  private readonly logger = new Logger(SmtpIngestionService.name);
  private readonly spoolDir: string;
  private readonly port: number;
  private readonly useProxy: boolean;
  private readonly maxClients: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly mailProducer: InboundMailProducer,
    private readonly mailboxCache: MailboxCacheService,
    private readonly authService: AuthService,
  ) {
    const rawSpoolDir =
      this.configService.get<string>('smtp.spoolDir') || './mail-spool';
    this.spoolDir = resolve(process.cwd(), rawSpoolDir);
    this.port = this.configService.get<number>('smtp.port') || 2525;
    this.useProxy = this.configService.get<boolean>('smtp.useProxy') ?? false;
    this.maxClients = this.configService.get<number>('smtp.maxClients') || 100;
  }

  onApplicationBootstrap() {
    if (!existsSync(this.spoolDir)) {
      mkdirSync(this.spoolDir, { recursive: true });
    }

    this.server = new SMTPServer({
      banner: 'ESMTP Mail Server Ready (NestJS Production Ready)',
      size: 25 * 1024 * 1024, // 25MB Max
      authOptional: true,
      disabledCommands: ['VRFY'],
      closeTimeout: 30000, // Slowloris DoS 방어: 30초
      socketTimeout: 30000,
      useProxy: this.useProxy, // Reverse Proxy (HAProxy / PROXY protocol)
      maxClients: this.maxClients, // 동시 접속자 수 제한

      // 1. SMTP AUTH 인증 처리
      onAuth: async (
        auth: SMTPServerAuthentication,
        session: SMTPServerSession,
        callback: (
          err?: Error | null,
          response?: SMTPServerAuthenticationResponse,
        ) => void,
      ) => {
        this.logger.debug(
          `[SMTP AUTH] Attempt for user: ${auth.username} from ${session.remoteAddress}`,
        );
        try {
          if (!auth.username || !auth.password) {
            return callback(new Error('535 5.7.8 Authentication credentials invalid'));
          }

          const isValid = await this.authService.validateForSmtp(
            auth.username,
            auth.password,
          );

          if (isValid) {
            return callback(null, { user: auth.username });
          } else {
            this.logger.warn(`[SMTP AUTH] Invalid credentials for: ${auth.username}`);
            return callback(new Error('535 5.7.8 Authentication credentials invalid'));
          }
        } catch (err: any) {
          this.logger.error(`[SMTP AUTH] Auth check failed: ${err.message}`);
          return callback(new Error('454 4.7.0 Temporary authentication failure'));
        }
      },

      // 2. 발신자 점검
      onMailFrom: (
        address: SMTPServerAddress,
        session: SMTPServerSession,
        callback: (err?: Error | null) => void,
      ) => {
        this.logger.debug(
          `[SMTP] MAIL FROM: ${address.address} (Client IP: ${session.remoteAddress})`,
        );
        callback();
      },

      // 3. 수신자 검증 단계 (Early Reject & Open Relay 방지 with Cache)
      onRcptTo: async (
        address: SMTPServerAddress,
        session: SMTPServerSession,
        callback: (err?: Error | null) => void,
      ) => {
        const rcptEmail = address.address.toLowerCase().trim();
        this.logger.debug(`[SMTP] RCPT TO: ${rcptEmail}`);

        try {
          const isAuthenticated = !!session.user;

          // Redis & In-Memory 캐시 기반의 O(1) 사서함 활성화 검증 (DB 쿼리 부하 제거)
          const isRegisteredAndActive = await this.mailboxCache.isMailboxActive(rcptEmail);

          if (this.mailboxCache.hasRegisteredMailboxes()) {
            if (!isRegisteredAndActive) {
              if (!isAuthenticated) {
                this.logger.warn(
                  `[SMTP] Early Reject / Open Relay blocked: ${rcptEmail} from ${session.remoteAddress}`,
                );
                return callback(
                  new Error('550 5.1.1 User unknown or relaying denied'),
                );
              }
              // 인증된 사용자라면 외부 릴레이 가능 (아웃바운드 확장)
            }
          }

          callback();
        } catch (err) {
          this.logger.error(`[SMTP] Early Reject check failed: ${err.message}`);
          callback(new Error('451 4.3.0 Temporary system failure'));
        }
      },

      // 4. 본문 논블로킹 스트리밍 수신 (Raw EML Disk Spooling)
      onData: (
        stream: SMTPServerDataStream,
        session: SMTPServerSession,
        callback: (err?: Error | null, message?: string) => void,
      ) => {
        const id = randomUUID();
        const rawFilePath = join(this.spoolDir, `${id}.eml`);
        const fileStream = createWriteStream(rawFilePath);

        this.logger.log(`[SMTP] Receiving message ${id} to ${rawFilePath}`);

        stream.pipe(fileStream);

        stream.on('end', async () => {
          try {
            const from = session.envelope.mailFrom
              ? session.envelope.mailFrom.address
              : '';
            const to = session.envelope.rcptTo.map((rcpt) => rcpt.address);

            await this.mailProducer.enqueueInbound({
              id,
              rawFilePath,
              from,
              to,
              clientIp: session.remoteAddress,
            });

            this.logger.log(`[SMTP] Successfully spooled and enqueued message ${id}`);
            callback(null, '250 2.0.0 OK: Message queued');
          } catch (err) {
            this.logger.error(`[SMTP] Enqueue failed for ${id}: ${err.message}`);
            callback(new Error('451 4.3.0 Local queue failure'));
          }
        });

        stream.on('error', (err) => {
          this.logger.error(`[SMTP] Stream error for ${id}: ${err.message}`);
          callback(new Error('451 4.4.2 Stream transfer aborted'));
        });
      },
    });

    this.server.on('error', (err) => {
      this.logger.error(`[SMTP Server Error] ${err.message}`, err.stack);
    });

    this.server.listen(this.port, () => {
      this.logger.log(
        `SMTP Ingestion Engine listening on port ${this.port} (Spool: ${this.spoolDir}, useProxy: ${this.useProxy}, maxClients: ${this.maxClients})`,
      );
    });
  }

  async onApplicationShutdown() {
    if (this.server) {
      await new Promise<void>((resolve) =>
        this.server.close(() => {
          this.logger.log('SMTP Ingestion Engine stopped gracefully');
          resolve();
        }),
      );
    }
  }
}
