import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('domain')
export class Domain {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_domain_name', { unique: true })
  @Column({ type: 'varchar', length: 255, unique: true })
  name: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @Column({ name: 'dkim_selector', type: 'varchar', length: 64, nullable: true, default: 'default' })
  dkimSelector: string | null;

  @Column({ name: 'dkim_private_key', type: 'text', nullable: true })
  dkimPrivateKey: string | null;

  @Column({ name: 'dkim_public_key', type: 'text', nullable: true })
  dkimPublicKey: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
