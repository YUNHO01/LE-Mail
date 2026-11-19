import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('user_mail_ai_summaries')
@Index('uq_user_mail_ai_summary', ['userId', 'messageId'], { unique: true })
export class UserMailAiSummary {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId: string;

  @Column({ name: 'message_id', type: 'varchar', length: 36 })
  messageId: string;

  @Column({ name: 'preferred_language', type: 'varchar', length: 20, default: 'ko' })
  preferredLanguage: string;

  @Column({ name: 'content_hash', type: 'varchar', length: 64 })
  contentHash: string;

  @Column({ type: 'varchar', length: 30, default: 'OPENAI' })
  provider: string;

  @Column({ type: 'varchar', length: 100, default: 'gpt-4o-mini' })
  model: string;

  @Column({ type: 'text' })
  summary: string;

  @Column({ name: 'action_items_json', type: 'text', nullable: true })
  actionItemsJson: string | null;

  @Column({ name: 'key_dates_json', type: 'text', nullable: true })
  keyDatesJson: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
