import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { BackupStatus } from '@lemail/shared-types';

@Entity('mail_backup')
@Index('idx_backup_user_created', ['userId', 'createdAt'])
export class MailBackup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId: string;

  @Column({ name: 'folder_id', type: 'varchar', length: 36, nullable: true })
  folderId: string | null;

  @Column({ name: 'folder_name', type: 'varchar', length: 100 })
  folderName: string;

  @Column({
    type: 'enum',
    enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED'],
    default: 'PENDING',
  })
  status: BackupStatus;

  @Column({ name: 'total_count', type: 'int', default: 0 })
  totalCount: number;

  @Column({ name: 'file_size_bytes', type: 'bigint', default: 0 })
  fileSizeBytes: number;

  @Column({ name: 'file_path', type: 'varchar', length: 500, nullable: true })
  filePath: string | null;

  @Index('idx_backup_token', { unique: true })
  @Column({ name: 'download_token', type: 'varchar', length: 128 })
  downloadToken: string;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'expires_at', type: 'timestamp' })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
