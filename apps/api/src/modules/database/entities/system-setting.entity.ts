import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import {
  SettingCategory,
  RestartLevel,
  TargetModule,
} from '@lemail/shared-types';

@Entity('system_settings')
export class SystemSetting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_settings_category')
  @Column({
    type: 'enum',
    enum: SettingCategory,
    default: SettingCategory.SERVER,
  })
  category: SettingCategory;

  @Index('idx_settings_key', { unique: true })
  @Column({ type: 'varchar', length: 100, unique: true })
  key: string;

  @Column({ type: 'text', nullable: true })
  value: string | null;

  @Column({
    name: 'value_type',
    type: 'enum',
    enum: ['string', 'number', 'boolean', 'json'],
    default: 'string',
  })
  valueType: 'string' | 'number' | 'boolean' | 'json';

  @Column({ name: 'is_encrypted', type: 'boolean', default: false })
  isEncrypted: boolean;

  @Column({ name: 'is_secret', type: 'boolean', default: false })
  isSecret: boolean;

  @Column({
    name: 'restart_required',
    type: 'enum',
    enum: RestartLevel,
    default: RestartLevel.NONE,
  })
  restartRequired: RestartLevel;

  @Column({
    name: 'target_module',
    type: 'enum',
    enum: TargetModule,
    default: TargetModule.NONE,
  })
  targetModule: TargetModule;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @Column({ name: 'updated_by', type: 'varchar', length: 36, nullable: true })
  updatedBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
