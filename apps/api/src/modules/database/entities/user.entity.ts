import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { UserRole } from '@lemail/shared-types';
import type { EmploymentStatus, OrgSyncSource } from '@lemail/shared-types';

export { UserRole };

@Entity('user')
@Index('idx_user_dept', ['departmentId', 'isActive'])
@Index('idx_user_emp_status', ['employmentStatus', 'isActive'])
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

  @Index('uq_user_employee_id', { unique: true })
  @Column({ name: 'employee_id', type: 'varchar', length: 50, unique: true, nullable: true })
  employeeId: string | null;

  @Index('uq_user_ams_user_id', { unique: true })
  @Column({ name: 'ams_user_id', type: 'varchar', length: 100, unique: true, nullable: true })
  amsUserId: string | null;

  @Column({ name: 'department_id', type: 'varchar', length: 36, nullable: true })
  departmentId: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  position: string | null;

  @Column({ name: 'job_title', type: 'varchar', length: 100, nullable: true })
  jobTitle: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  mobile: string | null;

  @Column({
    name: 'sync_source',
    type: 'enum',
    enum: ['LOCAL', 'AMS'],
    default: 'LOCAL',
  })
  syncSource: OrgSyncSource;

  @Column({
    name: 'employment_status',
    type: 'enum',
    enum: ['ACTIVE', 'ON_LEAVE', 'RESIGNED'],
    default: 'ACTIVE',
  })
  employmentStatus: EmploymentStatus;

  @Column({ name: 'resigned_at', type: 'timestamp', nullable: true })
  resignedAt: Date | null;

  @Column({ name: 'last_synced_at', type: 'timestamp', nullable: true })
  lastSyncedAt: Date | null;

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
