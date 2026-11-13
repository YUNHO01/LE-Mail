import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum HolidaySourceEnum {
  SEED = 'SEED',
  KASI_API = 'KASI_API',
  ICS_IMPORT = 'ICS_IMPORT',
  ADMIN_MANUAL = 'ADMIN_MANUAL',
}

@Entity('system_holiday')
@Index('idx_sh_year', ['year'])
@Index('idx_sh_date_name', ['holidayDate', 'name'], { unique: true })
export class SystemHoliday {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'holiday_date', type: 'varchar', length: 10 })
  holidayDate: string; // YYYY-MM-DD

  @Column({ type: 'int' })
  year: number;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ name: 'is_substitute', type: 'boolean', default: false })
  isSubstitute: boolean;

  @Column({
    type: 'enum',
    enum: HolidaySourceEnum,
    default: HolidaySourceEnum.SEED,
  })
  source: HolidaySourceEnum;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
