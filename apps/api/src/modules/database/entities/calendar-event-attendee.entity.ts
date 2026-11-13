import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum AttendeeRsvpStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED',
  TENTATIVE = 'TENTATIVE',
}

@Entity('calendar_event_attendee')
@Index('idx_cea_event', ['eventId'])
export class CalendarEventAttendee {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'event_id', type: 'varchar', length: 36 })
  eventId: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  name: string | null;

  @Column({
    name: 'rsvp_status',
    type: 'enum',
    enum: AttendeeRsvpStatus,
    default: AttendeeRsvpStatus.PENDING,
  })
  rsvpStatus: AttendeeRsvpStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
