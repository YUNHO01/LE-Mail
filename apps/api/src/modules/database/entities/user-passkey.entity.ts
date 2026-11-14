import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

@Entity('user_passkey')
@Index('idx_up_user', ['userId'])
export class UserPasskey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Index('uq_up_credential_id', { unique: true })
  @Column({ name: 'credential_id', type: 'varchar', length: 512, unique: true })
  credentialId: string;

  @Column({ name: 'public_key_pem', type: 'text' })
  publicKeyPem: string;

  @Column({ type: 'int', default: -7 })
  algorithm: number;

  @Column({ type: 'int', unsigned: true, default: 0 })
  counter: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  transports: string | null;

  @Column({ name: 'device_name', type: 'varchar', length: 120, default: '모바일 기기' })
  deviceName: string;

  @Column({ name: 'last_used_at', type: 'timestamp', nullable: true })
  lastUsedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
