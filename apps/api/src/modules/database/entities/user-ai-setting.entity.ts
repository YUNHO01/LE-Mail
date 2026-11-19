import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { AiProvider, AiResponseTone } from '@lemail/shared-types';

@Entity('user_ai_settings')
export class UserAiSetting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('uq_user_ai_user_id', { unique: true })
  @Column({ name: 'user_id', type: 'varchar', length: 36, unique: true })
  userId: string;

  @Column({ name: 'is_enabled', type: 'boolean', default: false })
  isEnabled: boolean;

  @Column({
    type: 'enum',
    enum: [
      AiProvider.OPENAI,
      AiProvider.GEMINI,
      AiProvider.ANTHROPIC,
      AiProvider.CUSTOM,
    ],
    default: AiProvider.OPENAI,
  })
  provider: AiProvider;

  @Column({ type: 'varchar', length: 100, default: 'gpt-4o-mini' })
  model: string;

  @Column({ name: 'api_key_encrypted', type: 'text', nullable: true })
  apiKeyEncrypted: string | null;

  @Column({
    name: 'custom_base_url',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  customBaseUrl: string | null;

  @Column({
    name: 'response_tone',
    type: 'enum',
    enum: [
      AiResponseTone.PROFESSIONAL,
      AiResponseTone.FRIENDLY,
      AiResponseTone.CONCISE,
    ],
    default: AiResponseTone.PROFESSIONAL,
  })
  responseTone: AiResponseTone;

  @Column({
    name: 'preferred_language',
    type: 'varchar',
    length: 20,
    default: 'ko',
  })
  preferredLanguage: string;

  @Column({ name: 'auto_summarize_on_read', type: 'boolean', default: false })
  autoSummarizeOnRead: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
