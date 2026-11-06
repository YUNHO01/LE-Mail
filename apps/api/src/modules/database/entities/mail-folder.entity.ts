import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { FolderType } from '@lemail/shared-types';
import { User } from './user.entity';

@Entity('mail_folder')
@Index('idx_folder_user_parent', ['userId', 'parentId'])
@Index('idx_folder_user_type', ['userId', 'type'])
export class MailFolder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ name: 'parent_id', type: 'varchar', length: 36, nullable: true })
  parentId: string | null;

  @ManyToOne(() => MailFolder, (folder) => folder.children, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'parent_id' })
  parent?: MailFolder | null;

  @OneToMany(() => MailFolder, (folder) => folder.parent)
  children?: MailFolder[];

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({
    type: 'enum',
    enum: FolderType,
    default: FolderType.CUSTOM,
  })
  type: FolderType;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'is_system', type: 'boolean', default: false })
  isSystem: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
