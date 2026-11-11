import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, In } from 'typeorm';
import { MailBackup, UserMail, MailFolder, MailMessage } from '../database/entities';
import { BackupStatus, MailBackupDto, RequestMailBackupDto } from '@lemail/shared-types';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const archiver = require('archiver');

@Injectable()
export class MailBackupService {
  private readonly logger = new Logger(MailBackupService.name);
  private readonly backupRootDir = path.resolve(process.cwd(), 'mail-archive', 'backups');

  constructor(
    @InjectRepository(MailBackup)
    private readonly backupRepository: Repository<MailBackup>,
    @InjectRepository(UserMail)
    private readonly userMailRepository: Repository<UserMail>,
    @InjectRepository(MailFolder)
    private readonly folderRepository: Repository<MailFolder>,
  ) {
    if (!fs.existsSync(this.backupRootDir)) {
      try {
        fs.mkdirSync(this.backupRootDir, { recursive: true });
      } catch (err: any) {
        this.logger.error(`Failed to create backup root directory: ${err.message}`);
      }
    }
  }

  toDto(backup: MailBackup): MailBackupDto {
    const isCompleted = backup.status === BackupStatus.COMPLETED;
    const isExpired =
      backup.status === BackupStatus.EXPIRED ||
      (backup.expiresAt && new Date(backup.expiresAt).getTime() <= Date.now());

    return {
      id: backup.id,
      userId: backup.userId,
      folderId: backup.folderId,
      folderName: backup.folderName,
      status: isExpired && backup.status !== BackupStatus.FAILED ? BackupStatus.EXPIRED : backup.status,
      totalCount: backup.totalCount,
      fileSizeBytes: Number(backup.fileSizeBytes) || 0,
      downloadToken: isCompleted && !isExpired ? backup.downloadToken : undefined,
      downloadUrl: isCompleted && !isExpired ? `/api/mail/backup/download/${backup.downloadToken}` : undefined,
      errorMessage: backup.errorMessage,
      expiresAt: backup.expiresAt.toISOString(),
      createdAt: backup.createdAt.toISOString(),
    };
  }

  async getMyBackups(userId: string): Promise<MailBackupDto[]> {
    const backups = await this.backupRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 30,
    });
    return backups.map((b) => this.toDto(b));
  }

  async requestBackup(userId: string, dto: RequestMailBackupDto): Promise<MailBackupDto> {
    // 1. 진행 중인 백업이 있는지 확인
    const activeBackup = await this.backupRepository.findOne({
      where: {
        userId,
        status: In([BackupStatus.PENDING, BackupStatus.PROCESSING]),
      },
    });

    if (activeBackup) {
      throw new ConflictException('이미 진행 중인 메일함 백업 작업이 있습니다. 완료 후 다시 시도해 주세요.');
    }

    // 2. 폴더명 확인
    let folderName = '전체 메일함';
    if (dto.folderId) {
      const folder = await this.folderRepository.findOne({
        where: { id: dto.folderId, userId },
      });
      if (folder) {
        folderName = folder.name;
      }
    }

    // 3. 만료 일시 설정 (생성 시점 기준 7일 후)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const downloadToken = crypto.randomBytes(32).toString('hex');

    const backup = this.backupRepository.create({
      userId,
      folderId: dto.folderId || null,
      folderName,
      status: BackupStatus.PENDING,
      totalCount: 0,
      fileSizeBytes: 0,
      downloadToken,
      expiresAt,
    });

    const saved = await this.backupRepository.save(backup);

    // 4. 백그라운드 비동기 압축 실행
    setImmediate(() => {
      this.executeZipGeneration(saved.id).catch((err) => {
        this.logger.error(`Error in async backup generation for ${saved.id}: ${err.message}`, err.stack);
      });
    });

    return this.toDto(saved);
  }

  private async executeZipGeneration(backupId: string): Promise<void> {
    const backup = await this.backupRepository.findOne({ where: { id: backupId } });
    if (!backup) return;

    try {
      backup.status = BackupStatus.PROCESSING;
      await this.backupRepository.save(backup);

      // 대상 메일 쿼리
      const qb = this.userMailRepository
        .createQueryBuilder('um')
        .leftJoinAndSelect('um.message', 'msg')
        .leftJoinAndSelect('um.folder', 'folder')
        .where('um.userId = :userId', { userId: backup.userId })
        .andWhere('um.isDeleted = false');

      if (backup.folderId) {
        qb.andWhere('um.folderId = :folderId', { folderId: backup.folderId });
      }

      qb.orderBy('um.createdAt', 'ASC');

      const userMails = await qb.getMany();

      if (userMails.length === 0) {
        backup.status = BackupStatus.COMPLETED;
        backup.totalCount = 0;
        backup.fileSizeBytes = 0;
        await this.backupRepository.save(backup);
        return;
      }

      // 저장 디렉터리 준비
      const userBackupDir = path.join(this.backupRootDir, backup.userId);
      if (!fs.existsSync(userBackupDir)) {
        fs.mkdirSync(userBackupDir, { recursive: true });
      }

      const zipFilePath = path.join(userBackupDir, `LEMail_Backup_${backup.id}.zip`);
      const output = fs.createWriteStream(zipFilePath);
      const archive = archiver('zip', { zlib: { level: 6 } });

      await new Promise<void>((resolve, reject) => {
        output.on('close', () => resolve());
        archive.on('error', (err) => reject(err));

        archive.pipe(output);

        let appendedCount = 0;
        for (const um of userMails) {
          const rawPath = um.message?.rawFilePath;
          if (rawPath && fs.existsSync(rawPath)) {
            const folderName = um.folder?.name || '기타';
            const safeFolder = folderName.replace(/[\\/:*?"<>|]/g, '_');
            const dateStr = um.createdAt ? new Date(um.createdAt).toISOString().slice(0, 10) : 'unknown';
            const safeSubject = (um.message?.subject || '제목없음')
              .replace(/[\\/:*?"<>|]/g, '_')
              .slice(0, 50);
            const archiveName = `${safeFolder}/${dateStr}_${safeSubject}_${um.uid || appendedCount + 1}.eml`;

            archive.file(rawPath, { name: archiveName });
            appendedCount++;
          }
        }

        archive.finalize();
      });

      const stats = fs.statSync(zipFilePath);
      backup.status = BackupStatus.COMPLETED;
      backup.totalCount = userMails.length;
      backup.fileSizeBytes = stats.size;
      backup.filePath = zipFilePath;
      await this.backupRepository.save(backup);
      this.logger.log(`Backup completed: id=${backup.id}, mails=${userMails.length}, size=${stats.size} bytes`);
    } catch (err: any) {
      this.logger.error(`Backup generation failed: ${err.message}`, err.stack);
      backup.status = BackupStatus.FAILED;
      backup.errorMessage = err.message || '백업 압축 생성 중 오류 발생';
      await this.backupRepository.save(backup);
    }
  }

  async getBackupFileForDownload(token: string): Promise<{ filePath: string; fileName: string }> {
    const backup = await this.backupRepository.findOne({
      where: { downloadToken: token },
    });

    if (!backup) {
      throw new NotFoundException('유효하지 않은 백업 다운로드 링크입니다.');
    }

    if (backup.status !== BackupStatus.COMPLETED) {
      throw new NotFoundException('백업 파일이 아직 생성되지 않았거나 생성에 실패했습니다.');
    }

    if (backup.expiresAt && new Date(backup.expiresAt).getTime() <= Date.now()) {
      backup.status = BackupStatus.EXPIRED;
      if (backup.filePath && fs.existsSync(backup.filePath)) {
        try {
          fs.unlinkSync(backup.filePath);
        } catch (_) {}
      }
      backup.filePath = null;
      await this.backupRepository.save(backup);
      throw new NotFoundException('백업 파일의 다운로드 유효 기간이 만료되었습니다.');
    }

    if (!backup.filePath || !fs.existsSync(backup.filePath)) {
      throw new NotFoundException('서버에서 백업 압축 파일을 찾을 수 없습니다.');
    }

    const dateStr = new Date(backup.createdAt).toISOString().slice(0, 10).replace(/-/g, '');
    const safeFolderName = backup.folderName.replace(/[\\/:*?"<>|]/g, '_');
    const fileName = `LEMail_Backup_${safeFolderName}_${dateStr}.zip`;

    return { filePath: backup.filePath, fileName };
  }

  async cleanExpiredBackups(): Promise<number> {
    const now = new Date();
    const expiredList = await this.backupRepository.find({
      where: {
        expiresAt: LessThan(now),
        status: In([BackupStatus.COMPLETED, BackupStatus.PENDING, BackupStatus.PROCESSING]),
      },
    });

    let cleanedCount = 0;
    for (const backup of expiredList) {
      if (backup.filePath && fs.existsSync(backup.filePath)) {
        try {
          await fs.promises.unlink(backup.filePath);
          this.logger.log(`Deleted expired backup file: ${backup.filePath}`);
        } catch (err: any) {
          this.logger.warn(`Could not delete file ${backup.filePath}: ${err.message}`);
        }
      }
      backup.status = BackupStatus.EXPIRED;
      backup.filePath = null;
      await this.backupRepository.save(backup);
      cleanedCount++;
    }

    return cleanedCount;
  }
}
