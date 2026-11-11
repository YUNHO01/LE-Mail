import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { MailBackupService } from './mail-backup.service';

@Injectable()
export class MailBackupCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MailBackupCleanupService.name);
  private intervalTimer: NodeJS.Timeout | null = null;

  constructor(private readonly backupService: MailBackupService) {}

  onModuleInit() {
    // 서버 기동 직후 1회 정리 실행 (초기 5초 후)
    setTimeout(() => {
      this.runCleanup();
    }, 5000);

    // 이후 1시간마다 만료 백업 파일 정리 (3600 * 1000 ms)
    this.intervalTimer = setInterval(() => {
      this.runCleanup();
    }, 60 * 60 * 1000);

    this.logger.log('MailBackupCleanupService initialized (Hourly expiration sweep scheduled)');
  }

  onModuleDestroy() {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  private async runCleanup() {
    try {
      const count = await this.backupService.cleanExpiredBackups();
      if (count > 0) {
        this.logger.log(`Expired mail backups cleaned up: ${count} records processed.`);
      }
    } catch (err: any) {
      this.logger.error(`Error during mail backup cleanup: ${err.message}`, err.stack);
    }
  }
}
