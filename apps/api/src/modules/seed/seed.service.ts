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
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.seedSystemAdmin();
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
