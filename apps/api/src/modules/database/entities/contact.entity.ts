import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('contact')
@Index('idx_c_user', ['userId'])
@Index('idx_c_user_email', ['userId', 'email'])
@Index('idx_c_user_name', ['userId', 'name'])
@Index('idx_c_group', ['groupId'])
export class Contact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId: string;

  @Column({ name: 'group_id', type: 'varchar', length: 36, nullable: true })
  groupId: string | null;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  company: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  department: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  position: string | null;

  @Column({ name: 'company_phone', type: 'varchar', length: 50, nullable: true })
  companyPhone: string | null;

  @Column({ name: 'company_fax', type: 'varchar', length: 50, nullable: true })
  companyFax: string | null;

  @Column({ name: 'mobile_country_code', type: 'varchar', length: 10, default: '+82', nullable: true })
  mobileCountryCode: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  birthday: string | null;

  @Column({ name: 'postal_code', type: 'varchar', length: 20, nullable: true })
  postalCode: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address: string | null;

  @Column({ name: 'website_url', type: 'varchar', length: 255, nullable: true })
  websiteUrl: string | null;

  @Column({ type: 'text', nullable: true })
  memo: string | null;

  @Column({ name: 'is_starred', type: 'boolean', default: false })
  isStarred: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
