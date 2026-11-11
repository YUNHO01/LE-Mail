import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { User } from '../database/entities/user.entity';
import { Mailbox } from '../database/entities/mailbox.entity';
import { Domain } from '../database/entities/domain.entity';
import { UserRole } from '@lemail/shared-types';
import { MailboxCacheService } from '../smtp-ingestion/mailbox-cache.service';
import { MailFolderService } from '../mail-folder/mail-folder.service';
import { SettingsSeedService } from './settings-seed.service';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Mailbox)
    private readonly mailboxRepository: Repository<Mailbox>,
    @InjectRepository(Domain)
    private readonly domainRepository: Repository<Domain>,
    private readonly configService: ConfigService,
    private readonly mailboxCacheService: MailboxCacheService,
    private readonly mailFolderService: MailFolderService,
    private readonly settingsSeedService: SettingsSeedService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.ensureSchemaColumns();
    await this.seedSystemAdmin();
    await this.settingsSeedService.seedSettings();
  }

  private async ensureSchemaColumns(): Promise<void> {
    const runSafeQuery = async (query: string, logMsg?: string) => {
      try {
        await this.userRepository.query(query);
        if (logMsg) {
          this.logger.log(logMsg);
        }
      } catch (err: any) {
        if (
          err.errno === 1060 ||
          err.code === 'ER_DUP_FIELDNAME' ||
          err.errno === 1050 ||
          err.code === 'ER_TABLE_EXISTS_ERROR' ||
          err.errno === 1061 ||
          err.code === 'ER_DUP_KEYNAME'
        ) {
          // 이미 컬럼/인덱스/테이블이 존재하므로 정상 처리
        } else {
          this.logger.warn(`Schema update note (${err.message}): ${query.trim().substring(0, 80)}...`);
        }
      }
    };

    await runSafeQuery(
      'ALTER TABLE `mail_message` ADD COLUMN `failure_reason` TEXT NULL AFTER `status`;',
      'Successfully ensured mail_message.failure_reason column.',
    );

    await runSafeQuery(`
      CREATE TABLE IF NOT EXISTS \`spam_rules\` (
        \`id\` VARCHAR(36) PRIMARY KEY,
        \`user_id\` VARCHAR(36) NULL,
        \`type\` ENUM('WHITELIST', 'BLACKLIST') NOT NULL DEFAULT 'BLACKLIST',
        \`target_type\` ENUM('EMAIL', 'DOMAIN', 'IP') NOT NULL DEFAULT 'EMAIL',
        \`pattern\` VARCHAR(255) NOT NULL,
        \`reason\` VARCHAR(255) NULL,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX \`idx_spam_rules_user_type\` (\`user_id\`, \`type\`),
        INDEX \`idx_spam_rules_pattern\` (\`pattern\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `, 'Successfully ensured spam_rules table.');

    await runSafeQuery(`
      CREATE TABLE IF NOT EXISTS \`bayesian_tokens\` (
        \`token\` VARCHAR(128) PRIMARY KEY,
        \`spam_count\` INT NOT NULL DEFAULT 0,
        \`ham_count\` INT NOT NULL DEFAULT 0,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `, 'Successfully ensured bayesian_tokens table.');

    await runSafeQuery(
      'ALTER TABLE `mail_message` ADD COLUMN `spam_score` FLOAT NOT NULL DEFAULT 0 AFTER `status`;',
    );

    await runSafeQuery(
      'ALTER TABLE `mail_message` ADD COLUMN `spam_reasons` TEXT NULL AFTER `spam_score`;',
    );

    await runSafeQuery(
      "ALTER TABLE `mail_message` MODIFY COLUMN `status` ENUM('QUEUED', 'PROCESSED', 'FAILED', 'QUARANTINED') NOT NULL DEFAULT 'QUEUED';",
    );

    await runSafeQuery(
      "ALTER TABLE `domain` ADD COLUMN `dkim_selector` VARCHAR(64) NULL DEFAULT 'default';",
      'Successfully ensured domain.dkim_selector column.',
    );

    await runSafeQuery(
      'ALTER TABLE `domain` ADD COLUMN `dkim_private_key` TEXT NULL;',
      'Successfully ensured domain.dkim_private_key column.',
    );

    await runSafeQuery(
      'ALTER TABLE `domain` ADD COLUMN `dkim_public_key` TEXT NULL;',
      'Successfully ensured domain.dkim_public_key column.',
    );

    await runSafeQuery(
      'ALTER TABLE `user_mail` ADD COLUMN `is_forwarded` BOOLEAN NOT NULL DEFAULT FALSE AFTER `is_answered`;',
      'Successfully ensured user_mail.is_forwarded column.',
    );

    await runSafeQuery(
      'ALTER TABLE `mail_message` ADD COLUMN `is_secure` BOOLEAN NOT NULL DEFAULT FALSE AFTER `failure_reason`;',
      'Successfully ensured mail_message.is_secure column.',
    );

    await runSafeQuery(
      'ALTER TABLE `mail_message` ADD COLUMN `is_important` BOOLEAN NOT NULL DEFAULT FALSE AFTER `is_secure`;',
      'Successfully ensured mail_message.is_important column.',
    );

    await runSafeQuery(
      'ALTER TABLE `user_mail` ADD COLUMN `is_seen` BOOLEAN NOT NULL DEFAULT FALSE AFTER `is_read`;',
      'Successfully ensured user_mail.is_seen column.',
    );
  }

  async seedSystemAdmin(): Promise<void> {
    try {
      const adminExists = await this.userRepository.findOne({
        where: { role: UserRole.SYSTEM_ADMIN },
      });

      const adminEmail =
        this.configService.get<string>('defaultAdmin.email') || 'admin@lineedge.com';
      const adminPassword =
        this.configService.get<string>('defaultAdmin.password') || 'admin1234!';
      const adminName =
        this.configService.get<string>('defaultAdmin.name') || '시스템관리자';

      if (!adminExists) {
        this.logger.log(`No SYSTEM_ADMIN found. Initializing default admin: ${adminEmail}`);

        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(adminPassword, saltRounds);

        const newAdmin = this.userRepository.create({
          email: adminEmail,
          passwordHash,
          name: adminName,
          role: UserRole.SYSTEM_ADMIN,
          isActive: true,
        });

        await this.userRepository.save(newAdmin);
        this.logger.log(`Default SYSTEM_ADMIN created successfully: ${adminEmail}`);
      } else {
        this.logger.log(`SYSTEM_ADMIN already exists: ${adminExists.email}`);
      }

      // Ensure default domain exists
      const domainName = (adminEmail.split('@')[1] || 'lineedge.com').toLowerCase().trim();
      let defaultDomain = await this.domainRepository.findOne({
        where: { name: domainName },
      });

      if (!defaultDomain) {
        defaultDomain = this.domainRepository.create({
          name: domainName,
          isActive: true,
          isDefault: true,
          description: '기본 시스템 도메인',
        });
        await this.domainRepository.save(defaultDomain);
        this.logger.log(`Default domain seeded: ${domainName}`);
      }

      // Also migrate any existing mailbox domains into domain table if not exists
      const existingMailboxes = await this.mailboxRepository.find({ select: { domain: true } });
      const uniqueDomains = Array.from(new Set(existingMailboxes.map((m) => m.domain?.toLowerCase().trim()).filter(Boolean)));
      for (const d of uniqueDomains) {
        const found = await this.domainRepository.findOne({ where: { name: d } });
        if (!found) {
          await this.domainRepository.save(
            this.domainRepository.create({
              name: d,
              isActive: true,
              isDefault: false,
              description: '기존 사서함 연동 도메인',
            }),
          );
          this.logger.log(`Migrated mailbox domain to domain table: ${d}`);
        }
      }

      // Ensure mailbox for admin exists
      const domain = domainName;
      let mailbox = await this.mailboxRepository.findOne({
        where: { email: adminEmail },
      });

      if (!mailbox) {
        mailbox = this.mailboxRepository.create({
          email: adminEmail,
          domain,
          isActive: true,
        });
        await this.mailboxRepository.save(mailbox);
        this.logger.log(`Admin mailbox created: ${adminEmail}`);
      }

      await this.mailboxCacheService.invalidate();

      // Ensure default folders for all existing users (including admin)
      const count = await this.mailFolderService.ensureDefaultFoldersForAllUsers();
      if (count > 0) {
        this.logger.log(`Initialized default folders for existing users: ${count} folders created`);
      }
    } catch (err: any) {
      this.logger.error(`Failed to seed system administrator: ${err.message}`, err.stack);
    }
  }
}
