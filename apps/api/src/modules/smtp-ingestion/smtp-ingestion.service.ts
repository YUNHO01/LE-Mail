import {
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  Logger,
  Inject,
  forwardRef,
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
import { createWriteStream, existsSync, mkdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { randomUUID } from 'crypto';
import { InboundMailProducer } from '../queue/inbound-mail.producer';
import { MailboxCacheService } from './mailbox-cache.service';
import { RblCheckService } from './rbl-check.service';
import { AuthService } from '../auth/auth.service';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { SystemSetting } from '../database/entities/system-setting.entity';

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
    @Inject(forwardRef(() => InboundMailProducer))
    private readonly mailProducer: InboundMailProducer,
    private readonly mailboxCache: MailboxCacheService,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
    private readonly rblCheckService: RblCheckService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
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

  async onApplicationBootstrap() {
    if (!existsSync(this.spoolDir)) {
      mkdirSync(this.spoolDir, { recursive: true });
    }
    await this.syncSettingsFromDb();
    await this.startServer();
  }

  /**
   * DB system_settings 에 저장된 웹 환경설정 값을 최우선 반영
   */
  private async syncSettingsFromDb() {
    try {
      const repo = this.dataSource.getRepository(SystemSetting);
      const portSetting = await repo.findOne({ where: { key: 'SMTP_PORT' } });
      if (portSetting?.value) {
        this.currentPort = parseInt(portSetting.value, 10);
      }
      const maxClientsSetting = await repo.findOne({ where: { key: 'SMTP_MAX_CLIENTS' } });
      if (maxClientsSetting?.value) {
        this.currentMaxClients = parseInt(maxClientsSetting.value, 10);
      }
      const proxySetting = await repo.findOne({ where: { key: 'SMTP_USE_PROXY' } });
      if (proxySetting?.value) {
        this.currentUseProxy = proxySetting.value === 'true';
      }
      this.logger.log(
        `[SmtpIngestionService] Loaded settings from DB: Port ${this.currentPort}, MaxClients ${this.currentMaxClients}, UseProxy ${this.currentUseProxy}`,
      );
    } catch (e: any) {
      this.logger.debug?.(`Initial DB settings sync note: ${e.message}`);
    }
  }

  private createServerInstance(): SMTPServer {
    const certCandidates = [
      {
        key: resolve(process.cwd(), 'apps/api/certs/smtp-key.pem'),
        cert: resolve(process.cwd(), 'apps/api/certs/smtp-cert.pem'),
      },
      {
        key: resolve(process.cwd(), 'certs/smtp-key.pem'),
        cert: resolve(process.cwd(), 'certs/smtp-cert.pem'),
      },
      {
        key: resolve(process.cwd(), 'services/haraka/config/tls_key.pem'),
        cert: resolve(process.cwd(), 'services/haraka/config/tls_cert.pem'),
      },
    ];

    let tlsKey: string | undefined;
    let tlsCert: string | undefined;

    for (const cand of certCandidates) {
      if (existsSync(cand.key) && existsSync(cand.cert)) {
        try {
          tlsKey = readFileSync(cand.key, 'utf8');
          tlsCert = readFileSync(cand.cert, 'utf8');
          this.logger.log(`[SMTP TLS] Loaded TLS certificate from ${cand.cert}`);
          break;
        } catch (e: any) {
          this.logger.warn(`[SMTP TLS] Failed to read cert from ${cand.cert}: ${e.message}`);
        }
      }
    }

    return new SMTPServer({
      banner: 'ESMTP Mail Server Ready (NestJS Production Ready)',
      size: 25 * 1024 * 1024, // 25MB Max
      key: tlsKey,
      cert: tlsCert,
      secure: false, // Port 25/2525 opportunistic STARTTLS
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

        // 평문 인증 차단: TLS 세션이 활성화되지 않은 상태에서의 비밀번호 전송 차단
        if (tlsKey && tlsCert && !session.secure) {
          this.logger.warn(`[SMTP AUTH] Plaintext authentication rejected for user: ${auth.username}`);
          return callback(new Error('530 5.7.0 Must issue a STARTTLS command first'));
        }

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

      // 2. MAIL FROM 발신자 검증 & RBL 필터링
      onMailFrom: async (
        address: SMTPServerAddress,
        session: SMTPServerSession,
        callback: (err?: Error | null) => void,
      ) => {
        if (!address.address) {
          return callback(new Error('501 5.1.7 Bad sender address syntax'));
        }

        // 인증된 사용자 세션은 외부 RBL 검사 우회
        if (!session.user && session.remoteAddress) {
          try {
            const rblResult = await this.rblCheckService.checkIp(
              session.remoteAddress,
            );
            if (rblResult.isBlocked) {
              this.logger.warn(
                `[SMTP RBL Block] Rejected connection from ${session.remoteAddress} (Listed in ${rblResult.rbl})`,
              );
              return callback(
                new Error(
                  `554 5.7.1 Service unavailable; Client host [${session.remoteAddress}] blocked using ${rblResult.rbl}`,
                ),
              );
            }
          } catch (rblErr: any) {
            this.logger.error(`[SMTP RBL Check Error] ${rblErr.message}`);
          }
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
