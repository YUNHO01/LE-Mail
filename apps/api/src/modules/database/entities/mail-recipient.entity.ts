import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { MailMessage } from './mail-message.entity';

export enum RecipientType {
  TO = 'TO',
  CC = 'CC',
  BCC = 'BCC',
}

@Entity('mail_recipient')
export class MailRecipient {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'message_id', type: 'varchar', length: 36 })
  @Index('idx_recipient_message_id')
  messageId: string;

  @ManyToOne(() => MailMessage, (message) => message.recipients, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'message_id' })
  message: MailMessage;

  @Column({
    type: 'enum',
    enum: RecipientType,
  })
  type: RecipientType;

  @Column({ type: 'varchar', length: 255 })
  address: string;
}
