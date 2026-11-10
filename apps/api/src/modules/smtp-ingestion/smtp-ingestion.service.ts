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
  private server: SMTPServer | null = null;
  private isListening = false;
  private readonly logger = new Logger(SmtpIngestionService.name);
  private readonly spoolDir: string;
  private currentPort: number;
  private currentUseProxy: boolean;
  private currentMaxClients: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly mailProducer: InboundMailProducer,
    private readonly mailboxCache: MailboxCacheService,
    private readonly authService: AuthService,
  ) {
    const rawSpoolDir =
      this.configService.get<string>('smtp.spoolDir') || './mail-spool';
    this.spoolDir = resolve(process.cwd(), rawSpoolDir);
    this.currentPort = this.configService.get<number>('smtp.port') || 2525;
    this.currentUseProxy =
      this.configService.get<boolean>('smtp.useProxy') ?? false;
    this.currentMaxClients =
      this.configService.get<number>('smtp.maxClients') || 100;
  }

  onApplicationBootstrap() {
    if (!existsSync(this.spoolDir)) {
      mkdirSync(this.spoolDir, { recursive: true });
    }
    this.startServer();
  }

  private createServerInstance(): SMTPServer {
    return new SMTPServer({
      banner: 'ESMTP Mail Server Ready (NestJS Production Ready)',
      size: 25 * 1024 * 1024, // 25MB Max
      authOptional: true,
      disabledCommands: ['VRFY'],
      closeTimeout: 30000, // Slowloris DoS 방어: 30초
      socketTimeout: 30000,
      useProxy: this.currentUseProxy, // Reverse Proxy (HAProxy / PROXY protocol)
      maxClients: this.currentMaxClients, // 동시 접속자 수 제한

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
            this.logger.debug(`[SMTP AUTH] Success: ${auth.username}`);
            return callback(null, { user: auth.username });
          } else {
            this.logger.warn(`[SMTP AUTH] Failed for user: ${auth.username}`);
            return callback(new Error('535 5.7.8 Authentication credentials invalid'));
          }
        } catch (err) {
          this.logger.error(`[SMTP AUTH] Error: ${err.message}`);
          return callback(new Error('454 4.7.0 Temporary authentication failure'));
        }
      },

      // 2. MAIL FROM 발신자 검증
      onMailFrom: (
        address: SMTPServerAddress,
        session: SMTPServerSession,
        callback: (err?: Error | null) => void,
      ) => {
        if (!address.address) {
          return callback(new Error('501 5.1.7 Bad sender address syntax'));
        }
        callback();
      },

      // 3. RCPT TO 수신자 검증 (Early Reject & Open Relay 방지)
      onRcptTo: async (
        address: SMTPServerAddress,
        session: SMTPServerSession,
        callback: (err?: Error | null) => void,
      ) => {
        const recipientEmail = address.address.toLowerCase();

        // 인증된 사용자 (Authenticated Session)
        if (session.user) {
          return callback();
        }

        // 비인증 세션 (Inbound 메일 유입): 수신자 사서함 존재 여부 검증
        try {
          const exists = await this.mailboxCache.isMailboxActive(recipientEmail);
          if (!exists) {
            this.logger.warn(
              `[SMTP Inbound] Rejected RCPT TO: ${recipientEmail} (No such mailbox)`,
            );
            return callback(new Error('550 5.1.1 User unknown / Mailbox not found'));
          }
          callback();
        } catch (err) {
          this.logger.error(
            `[SMTP Inbound] Cache error during RCPT TO check: ${err.message}`,
          );
          callback(new Error('451 4.3.0 Temporary lookup failure'));
        }
      },

      // 4. DATA 스트림 스풀링 및 BullMQ Enqueue
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
  }

  private startServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = this.createServerInstance();

      this.server.on('error', (err) => {
        this.logger.error(`[SMTP Server Error] ${err.message}`, err.stack);
      });

      this.server.listen(this.currentPort, () => {
        this.isListening = true;
        this.logger.log(
          `SMTP Ingestion Engine listening on port ${this.currentPort} (Spool: ${this.spoolDir}, useProxy: ${this.currentUseProxy}, maxClients: ${this.currentMaxClients})`,
        );
        resolve();
      });
    });
  }

  /**
   * SMTP 수신 서버 graceful 재시작 (포트/옵션 핫 리로드)
   */
  async restartSmtpServer(
    newPort?: number,
    newMaxClients?: number,
    newUseProxy?: boolean,
  ): Promise<{ success: boolean; message: string; port: number }> {
    this.logger.warn(`Initiating graceful restart of Inbound SMTP Server...`);

    if (this.server && this.isListening) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => {
          this.isListening = false;
          this.logger.log('Previous SMTP Ingestion Server closed.');
          resolve();
        });
      });
    }

    if (newPort !== undefined) this.currentPort = newPort;
    if (newMaxClients !== undefined) this.currentMaxClients = newMaxClients;
    if (newUseProxy !== undefined) this.currentUseProxy = newUseProxy;

    await this.startServer();

    return {
      success: true,
      message: `SMTP 수신 서버가 포트 ${this.currentPort}에서 성공적으로 재시작되었습니다.`,
      port: this.currentPort,
    };
  }

  getStatus() {
    return {
      running: this.isListening,
      port: this.currentPort,
      maxClients: this.currentMaxClients,
      useProxy: this.currentUseProxy,
      spoolDir: this.spoolDir,
    };
  }

  async onApplicationShutdown() {
    if (this.server && this.isListening) {
      await new Promise<void>((resolve) =>
        this.server!.close(() => {
          this.isListening = false;
          this.logger.log('SMTP Ingestion Engine stopped gracefully');
          resolve();
        }),
      );
    }
  }
}
