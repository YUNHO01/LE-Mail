import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum CalendarTypeEnum {
  PERSONAL = 'PERSONAL',
  SHARED = 'SHARED',
  HOLIDAY = 'HOLIDAY',
}

@Entity('calendar')
@Index('idx_calendar_user', ['userId'])
export class Calendar {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 20, default: '#0284c7' })
  color: string;

  @Column({
    type: 'enum',
    enum: CalendarTypeEnum,
    default: CalendarTypeEnum.PERSONAL,
  })
  type: CalendarTypeEnum;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean;

  @Column({ name: 'is_visible', type: 'boolean', default: true })
  isVisible: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
