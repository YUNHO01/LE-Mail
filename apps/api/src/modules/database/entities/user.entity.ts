import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { UserRole } from '@lemail/shared-types';

export { UserRole };

@Entity('user')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_user_email')
  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Index('idx_user_role')
  @Column({
    type: 'enum',
    enum: [UserRole.SYSTEM_ADMIN, UserRole.USER],
    default: UserRole.USER,
  })
  role: UserRole;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'mailbox_quota_mb', type: 'int', default: 512 })
  mailboxQuotaMb: number;

  @Column({ name: 'preferred_language', type: 'varchar', length: 20, default: 'ko' })
  preferredLanguage: string;

  @Column({ type: 'varchar', length: 50, default: 'Asia/Seoul' })
  timezone: string;

  @Index('idx_user_employee_id')
  @Column({ name: 'employee_id', type: 'varchar', length: 50, nullable: true })
  employeeId: string | null;

  @Column({ name: 'last_login_at', type: 'timestamp', nullable: true })
  lastLoginAt: Date | null;

  @Column({ name: 'use_signature', type: 'boolean', default: false })
  useSignature: boolean;

  @Column({ name: 'signature_html', type: 'mediumtext', nullable: true })
  signatureHtml: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
