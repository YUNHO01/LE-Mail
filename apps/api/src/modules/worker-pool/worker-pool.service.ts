import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import Piscina from 'piscina';
import { resolve } from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { ParsedMailResult } from './mail-parser.worker';

@Injectable()
export class WorkerPoolService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerPoolService.name);
  private pool: Piscina;
  private readonly attachmentDir =
    process.env.MAIL_ATTACHMENT_DIR || './mail-attachments';

  onModuleInit() {
    if (!existsSync(this.attachmentDir)) {
      mkdirSync(this.attachmentDir, { recursive: true });
    }

    // dist 환경 및 ts-node 환경 파일 경로 처리
    const distWorkerPath = resolve(__dirname, 'mail-parser.worker.js');
    const tsWorkerPath = resolve(__dirname, 'mail-parser.worker.ts');
    const workerFile = existsSync(distWorkerPath)
      ? distWorkerPath
      : tsWorkerPath;

    this.logger.log(`Initializing Piscina WorkerPool with: ${workerFile}`);

    this.pool = new Piscina({
      filename: workerFile,
      minThreads: 2,
      maxThreads: 4,
      idleTimeout: 30000,
      execArgv: existsSync(distWorkerPath)
        ? []
        : ['-r', 'ts-node/register'],
    });
  }

  async parseMail(filePath: string): Promise<ParsedMailResult> {
    return this.pool.run({ filePath });
  }

  /**
   * Base64 버퍼로 전달된 첨부파일을 년/월/일 서브디렉토리에 저장하고 경로 반환
   */
  async saveAttachment(
    messageId: string,
    filename: string,
    contentBase64: string,
    date: Date = new Date(),
  ): Promise<string> {
    const year = String(date.getFullYear());
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const subDir = resolve(this.attachmentDir, year, month, day, messageId);
    if (!existsSync(subDir)) {
      mkdirSync(subDir, { recursive: true });
    }
    const safeFilename = `${randomUUID()}_${filename.replace(/[/\\?%*:|"<>]/g, '_')}`;
    const targetPath = resolve(subDir, safeFilename);
    const buffer = Buffer.from(contentBase64, 'base64');
    writeFileSync(targetPath, buffer);
    return targetPath;
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.destroy();
      this.logger.log('Piscina WorkerPool destroyed');
    }
  }
}
