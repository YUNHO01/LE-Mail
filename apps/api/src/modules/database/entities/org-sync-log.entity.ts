import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
} from 'typeorm';
import type { OrgSyncStatus, OrgSyncType } from '@lemail/shared-types';

@Entity('org_sync_log')
@Index('idx_org_sync_started', ['startedAt'])
export class OrgSyncLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    name: 'sync_type',
    type: 'enum',
    enum: ['FULL', 'INCREMENTAL', 'WEBHOOK'],
    default: 'FULL',
  })
  syncType: OrgSyncType;

  @Column({
    type: 'enum',
    enum: ['RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED'],
    default: 'RUNNING',
  })
  status: OrgSyncStatus;

  @Column({ name: 'total_count', type: 'int', default: 0 })
  totalCount: number;

  @Column({ name: 'created_count', type: 'int', default: 0 })
  createdCount: number;

  @Column({ name: 'updated_count', type: 'int', default: 0 })
  updatedCount: number;

  @Column({ name: 'deactivated_count', type: 'int', default: 0 })
  deactivatedCount: number;

  @Column({ name: 'skipped_count', type: 'int', default: 0 })
  skippedCount: number;

  @Column({ name: 'error_summary', type: 'text', nullable: true })
  errorSummary: string | null;

  @Column({ name: 'started_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  startedAt: Date;

  @Column({ name: 'finished_at', type: 'timestamp', nullable: true })
  finishedAt: Date | null;
}
