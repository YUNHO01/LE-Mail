import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('calendar_event')
@Index('idx_ce_calendar', ['calendarId'])
@Index('idx_ce_user_range', ['userId', 'startAt', 'endAt'])
export class CalendarEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'calendar_id', type: 'varchar', length: 36 })
  calendarId: string;

  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  location: string | null;

  @Column({ name: 'start_at', type: 'datetime' })
  startAt: Date;

  @Column({ name: 'end_at', type: 'datetime' })
  endAt: Date;

  @Column({ name: 'is_all_day', type: 'boolean', default: false })
  isAllDay: boolean;

  @Column({ type: 'varchar', length: 50, default: 'Asia/Seoul' })
  timezone: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  rrule: string | null;

  @Column({ name: 'recurrence_end_at', type: 'datetime', nullable: true })
  recurrenceEndAt: Date | null;

  @Column({ name: 'reminder_minutes_before', type: 'int', nullable: true })
  reminderMinutesBefore: number | null;

  @Column({ name: 'reminder_sent_at', type: 'datetime', nullable: true })
  reminderSentAt: Date | null;

  @Column({ name: 'source_mail_id', type: 'varchar', length: 36, nullable: true })
  sourceMailId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
