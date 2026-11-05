import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { MailMessage } from './mail-message.entity';

@Entity('mail_attachment')
export class MailAttachment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'message_id', type: 'varchar', length: 36 })
  @Index('idx_attachment_message_id')
  messageId: string;

  @ManyToOne(() => MailMessage, (message) => message.attachments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'message_id' })
  message: MailMessage;

  @Column({ type: 'varchar', length: 255 })
  filename: string;

  @Column({ name: 'content_type', type: 'varchar', length: 100 })
  contentType: string;

  @Column({ name: 'size_bytes', type: 'bigint' })
  sizeBytes: string;

  @Column({ name: 'storage_path', type: 'varchar', length: 500 })
  storagePath: string;
}
