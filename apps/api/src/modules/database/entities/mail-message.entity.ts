import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { MailRecipient } from './mail-recipient.entity';
import { MailAttachment } from './mail-attachment.entity';

export enum Direction {
  INBOUND = 'INBOUND',
  OUTBOUND = 'OUTBOUND',
}

export enum SpfResult {
  PASS = 'PASS',
  FAIL = 'FAIL',
  SOFTFAIL = 'SOFTFAIL',
  NEUTRAL = 'NEUTRAL',
  NONE = 'NONE',
}

export enum DkimResult {
  PASS = 'PASS',
  FAIL = 'FAIL',
  NONE = 'NONE',
}

export enum DmarcResult {
  PASS = 'PASS',
  FAIL = 'FAIL',
  NONE = 'NONE',
}

export enum MailStatus {
  QUEUED = 'QUEUED',
  PROCESSED = 'PROCESSED',
  FAILED = 'FAILED',
}

@Entity('mail_message')
export class MailMessage {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({
    type: 'enum',
    enum: Direction,
  })
  direction: Direction;

  @Column({ name: 'message_id', type: 'varchar', length: 255, nullable: true })
  messageId: string | null;

  @Index('idx_sender')
  @Column({ type: 'varchar', length: 255 })
  sender: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  subject: string | null;

  @Column({ name: 'raw_file_path', type: 'varchar', length: 500 })
  rawFilePath: string;

  @Column({
    name: 'spf_result',
    type: 'enum',
    enum: SpfResult,
    default: SpfResult.NONE,
  })
  spfResult: SpfResult;

  @Column({
    name: 'dkim_result',
    type: 'enum',
    enum: DkimResult,
    default: DkimResult.NONE,
  })
  dkimResult: DkimResult;

  @Column({
    name: 'dmarc_result',
    type: 'enum',
    enum: DmarcResult,
    default: DmarcResult.NONE,
  })
  dmarcResult: DmarcResult;

  @Column({
    type: 'enum',
    enum: MailStatus,
    default: MailStatus.QUEUED,
  })
  status: MailStatus;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason: string | null;

  @Index('idx_created_at')
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @OneToMany(() => MailRecipient, (recipient) => recipient.message, {
    cascade: ['insert'],
  })
  recipients: MailRecipient[];

  @OneToMany(() => MailAttachment, (attachment) => attachment.message, {
    cascade: ['insert'],
  })
  attachments: MailAttachment[];
}
