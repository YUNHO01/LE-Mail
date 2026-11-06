import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { MailFolder } from './mail-folder.entity';
import { MailMessage } from './mail-message.entity';

@Entity('user_mail')
@Index('idx_user_folder_created', ['userId', 'folderId', 'createdAt'])
@Index('idx_user_message', ['userId', 'messageId'])
export class UserMail {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ name: 'folder_id', type: 'varchar', length: 36 })
  folderId: string;

  @ManyToOne(() => MailFolder, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'folder_id' })
  folder?: MailFolder;

  @Column({ name: 'message_id', type: 'varchar', length: 36 })
  messageId: string;

  @ManyToOne(() => MailMessage, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'message_id' })
  message?: MailMessage;

  @Column({ name: 'is_read', type: 'boolean', default: false })
  isRead: boolean;

  @Column({ name: 'is_starred', type: 'boolean', default: false })
  isStarred: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
