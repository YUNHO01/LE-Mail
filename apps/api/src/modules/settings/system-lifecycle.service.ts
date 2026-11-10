import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { TargetModule } from '@lemail/shared-types';
import { SmtpIngestionService } from '../smtp-ingestion/smtp-ingestion.service';
import { SettingsService } from './settings.service';
import * as net from 'net';

@Injectable()
export class SystemLifecycleService {
  private readonly logger = new Logger(SystemLifecycleService.name);

  constructor(
    private readonly smtpIngestionService: SmtpIngestionService,
    private readonly settingsService: SettingsService,
  ) {}

  /**
   * 지정된 모듈 재시작 (Graceful Restart)
   */
  async restartModule(targetModule: string) {
    this.logger.warn(`Request to restart module: ${targetModule}`);

    switch (targetModule) {
      case TargetModule.SMTP_INGESTION:
      case 'SMTP_INGESTION': {
        const portStr = await this.settingsService.getDecryptedValue('SMTP_PORT', '2525');
        const maxClientsStr = await this.settingsService.getDecryptedValue(
          'SMTP_MAX_CLIENTS',
          '100',
        );
        const useProxyStr = await this.settingsService.getDecryptedValue(
          'SMTP_USE_PROXY',
          'false',
        );

        const newPort = parseInt(portStr, 10);
        const newMaxClients = parseInt(maxClientsStr, 10);
        const newUseProxy = useProxyStr === 'true';

        const result = await this.smtpIngestionService.restartSmtpServer(
          newPort,
          newMaxClients,
          newUseProxy,
        );

        return {
          success: true,
          module: TargetModule.SMTP_INGESTION,
          message: result.message,
          status: this.smtpIngestionService.getStatus(),
        };
      }

      case TargetModule.HARAKA:
      case 'HARAKA': {
        // Haraka MTA 헬스체크 및 리로드
        const harakaHost = await this.settingsService.getDecryptedValue(
          'HARAKA_HOST',
          '127.0.0.1',
        );
        const harakaPortStr = await this.settingsService.getDecryptedValue(
          'HARAKA_PORT',
          '2526',
        );
        const harakaPort = parseInt(harakaPortStr, 10) || 2526;
        const isUp = await this.checkPortTcp(harakaHost, harakaPort);

        return {
          success: true,
          module: TargetModule.HARAKA,
          message: isUp
            ? `Haraka Outbound MTA(${harakaHost}:${harakaPort})가 정상 가동 중입니다.`
            : `Haraka Outbound MTA(${harakaHost}:${harakaPort})에 연결할 수 없습니다. 서비스 상태를 확인하세요.`,
          isAlive: isUp,
        };
      }

      case TargetModule.API_SERVER:
      case 'API_SERVER': {
        // API 서버 재기동 알림 (PM2 클러스터 또는 도커 환경인 경우 안전한 재시작 유도)
        this.logger.warn('API_SERVER hard restart requested. Triggering graceful reload...');
        setTimeout(() => {
          if (process.send) {
            process.send('restart');
          } else {
            // Standalone 환경일 경우 로그 기록
            this.logger.log('Running in standalone mode. Please restart node process manually.');
          }
        }, 1000);

        return {
          success: true,
          module: TargetModule.API_SERVER,
          message: 'API 코어 서버 재시작 신호가 전송되었습니다. 약 3~5초 후 새로고침하세요.',
        };
      }

      default:
        throw new BadRequestException(`지원하지 않거나 재시작이 필요 없는 모듈입니다: ${targetModule}`);
    }
  }

  /**
   * 시스템 모듈 상태 점검
   */
  async getModulesStatus() {
    const smtpStatus = this.smtpIngestionService.getStatus();

    const harakaHost = await this.settingsService.getDecryptedValue('HARAKA_HOST', '127.0.0.1');
    const harakaPort = parseInt(
      await this.settingsService.getDecryptedValue('HARAKA_PORT', '2526'),
      10,
    );
    const harakaAlive = await this.checkPortTcp(harakaHost, harakaPort);

    const imapAlive = await this.checkPortTcp('127.0.0.1', 1143);

    return {
      smtpIngestion: {
        name: 'SMTP Inbound 수신 엔진',
        status: smtpStatus.running ? 'RUNNING' : 'STOPPED',
        port: smtpStatus.port,
        maxClients: smtpStatus.maxClients,
        useProxy: smtpStatus.useProxy,
      },
      harakaMta: {
        name: 'Haraka Outbound MTA',
        status: harakaAlive ? 'RUNNING' : 'STOPPED',
        host: harakaHost,
        port: harakaPort,
      },
      imapService: {
        name: 'IMAP4rev1 마이크로서비스',
        status: imapAlive ? 'RUNNING' : 'STOPPED',
        port: 1143,
      },
    };
  }

  private checkPortTcp(host: string, port: number, timeout = 2000): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(timeout);

      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });

      socket.once('timeout', () => {
        socket.destroy();
        resolve(false);
      });

      socket.once('error', () => {
        socket.destroy();
        resolve(false);
      });

      socket.connect(port, host);
    });
  }
}
