import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('system_licenses')
export class SystemLicense {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_license_id')
  @Column({ name: 'license_id', type: 'varchar', length: 64, unique: true })
  licenseId: string;

  @Column({ name: 'product', type: 'varchar', length: 50, default: 'LEMail' })
  product: string;

  @Column({ name: 'organization_name', type: 'varchar', length: 100 })
  organizationName: string;

  @Column({ name: 'max_users', type: 'int', default: 200 })
  maxUsers: number;

  @Column({ name: 'register_expires_at', type: 'datetime', nullable: true })
  registerExpiresAt: Date | null;

  @Column({ name: 'expires_at', type: 'datetime', nullable: true })
  expiresAt: Date | null;

  @Column({ name: 'is_unlimited', type: 'boolean', default: false })
  isUnlimited: boolean;

  @Column({ name: 'issued_at', type: 'datetime' })
  issuedAt: Date;

  /**
   * 라이선스 파일 내용의 SHA-256 해시값 (파일과 DB 변조 검증용)
   */
  @Column({ name: 'file_hash', type: 'varchar', length: 64 })
  fileHash: string;

  /**
   * 전자서명 검증 대상이 되는 정렬된 원본 JSON 문자열
   */
  @Column({ name: 'license_raw', type: 'text' })
  licenseRaw: string;

  /**
   * RSA-SHA256 Base64 전자서명
   */
  @Column({ name: 'signature', type: 'text' })
  signature: string;

  @Index('idx_license_is_active')
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
