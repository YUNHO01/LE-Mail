import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import type { OrgSyncSource } from '@lemail/shared-types';

@Entity('department')
@Index('idx_dept_parent', ['parentId', 'sortOrder'])
@Index('idx_dept_active', ['isActive'])
export class Department {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('uq_dept_code', { unique: true })
  @Column({ type: 'varchar', length: 64, unique: true, nullable: true })
  code: string | null;

  @Index('uq_dept_ams_id', { unique: true })
  @Column({ name: 'ams_dept_id', type: 'varchar', length: 100, unique: true, nullable: true })
  amsDeptId: string | null;

  @Column({ name: 'parent_id', type: 'varchar', length: 36, nullable: true })
  parentId: string | null;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'int', default: 0 })
  depth: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  path: string | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'manager_employee_id', type: 'varchar', length: 50, nullable: true })
  managerEmployeeId: string | null;

  @Column({
    type: 'enum',
    enum: ['LOCAL', 'AMS'],
    default: 'LOCAL',
  })
  source: OrgSyncSource;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'last_synced_at', type: 'timestamp', nullable: true })
  lastSyncedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
