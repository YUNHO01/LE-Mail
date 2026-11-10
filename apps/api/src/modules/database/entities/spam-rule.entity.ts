import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum SpamRuleType {
  WHITELIST = 'WHITELIST',
  BLACKLIST = 'BLACKLIST',
}

export enum SpamRuleTargetType {
  EMAIL = 'EMAIL',
  DOMAIN = 'DOMAIN',
  IP = 'IP',
}

@Entity('spam_rules')
@Index('idx_spam_rules_user_type', ['userId', 'type'])
@Index('idx_spam_rules_pattern', ['pattern'])
export class SpamRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'varchar', length: 36, nullable: true })
  userId: string | null;

  @Column({
    type: 'enum',
    enum: SpamRuleType,
    default: SpamRuleType.BLACKLIST,
  })
  type: SpamRuleType;

  @Column({
    name: 'target_type',
    type: 'enum',
    enum: SpamRuleTargetType,
    default: SpamRuleTargetType.EMAIL,
  })
  targetType: SpamRuleTargetType;

  @Column({ type: 'varchar', length: 255 })
  pattern: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reason: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
