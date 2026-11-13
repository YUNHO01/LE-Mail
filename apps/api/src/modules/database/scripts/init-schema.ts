import * as mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

const candidateDirs = [
  process.cwd(),
  path.resolve(process.cwd(), '..'),
  path.resolve(process.cwd(), '../..'),
  path.resolve(__dirname, '../../../../'),
  path.resolve(__dirname, '../../../../../'),
];
for (const dir of candidateDirs) {
  const envPath = path.join(dir, '.env');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS \`domain\` (
    \`id\` VARCHAR(36) PRIMARY KEY,
    \`name\` VARCHAR(255) NOT NULL UNIQUE,
    \`is_active\` BOOLEAN DEFAULT TRUE,
    \`is_default\` BOOLEAN DEFAULT FALSE,
    \`description\` VARCHAR(255) NULL,
    \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX \`idx_domain_name\` (\`name\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS \`mailbox\` (
    \`id\` VARCHAR(36) PRIMARY KEY,
    \`email\` VARCHAR(255) NOT NULL UNIQUE,
    \`domain\` VARCHAR(255) NOT NULL,
    \`is_active\` BOOLEAN DEFAULT TRUE,
    \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS \`user\` (
    \`id\` VARCHAR(36) PRIMARY KEY,
    \`email\` VARCHAR(255) NOT NULL UNIQUE,
    \`password_hash\` VARCHAR(255) NOT NULL,
    \`name\` VARCHAR(100) NOT NULL,
    \`role\` ENUM('SYSTEM_ADMIN', 'USER') NOT NULL DEFAULT 'USER',
    \`is_active\` BOOLEAN DEFAULT TRUE,
    \`mailbox_quota_mb\` INT NOT NULL DEFAULT 512,
    \`preferred_language\` VARCHAR(20) NOT NULL DEFAULT 'ko',
    \`timezone\` VARCHAR(50) NOT NULL DEFAULT 'Asia/Seoul',
    \`employee_id\` VARCHAR(50) NULL,
    \`last_login_at\` TIMESTAMP NULL,
    \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX \`idx_user_email\` (\`email\`),
    INDEX \`idx_user_role\` (\`role\`),
    INDEX \`idx_user_employee_id\` (\`employee_id\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS \`mail_message\` (
    \`id\` VARCHAR(36) PRIMARY KEY,
    \`direction\` ENUM('INBOUND', 'OUTBOUND') NOT NULL,
    \`message_id\` VARCHAR(255) NULL,
    \`sender\` VARCHAR(255) NOT NULL,
    \`subject\` VARCHAR(500) NULL,
    \`raw_file_path\` VARCHAR(500) NOT NULL,
    \`spf_result\` ENUM('PASS', 'FAIL', 'SOFTFAIL', 'NEUTRAL', 'NONE') DEFAULT 'NONE',
    \`dkim_result\` ENUM('PASS', 'FAIL', 'NONE') DEFAULT 'NONE',
    \`dmarc_result\` ENUM('PASS', 'FAIL', 'NONE') DEFAULT 'NONE',
    \`status\` ENUM('QUEUED', 'PROCESSED', 'FAILED') DEFAULT 'QUEUED',
    \`failure_reason\` TEXT NULL,
    \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX \`idx_sender\` (\`sender\`),
    INDEX \`idx_created_at\` (\`created_at\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS \`mail_recipient\` (
    \`id\` BIGINT AUTO_INCREMENT PRIMARY KEY,
    \`message_id\` VARCHAR(36) NOT NULL,
    \`type\` ENUM('TO', 'CC', 'BCC') NOT NULL,
    \`address\` VARCHAR(255) NOT NULL,
    CONSTRAINT \`fk_recipient_message\` FOREIGN KEY (\`message_id\`) REFERENCES \`mail_message\`(\`id\`) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS \`mail_attachment\` (
    \`id\` VARCHAR(36) PRIMARY KEY,
    \`message_id\` VARCHAR(36) NOT NULL,
    \`filename\` VARCHAR(255) NOT NULL,
    \`content_type\` VARCHAR(100) NOT NULL,
    \`size_bytes\` BIGINT NOT NULL,
    \`storage_path\` VARCHAR(500) NOT NULL,
    CONSTRAINT \`fk_attachment_message\` FOREIGN KEY (\`message_id\`) REFERENCES \`mail_message\`(\`id\`) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS \`mail_folder\` (
    \`id\` VARCHAR(36) PRIMARY KEY,
    \`user_id\` VARCHAR(36) NOT NULL,
    \`parent_id\` VARCHAR(36) NULL,
    \`name\` VARCHAR(100) NOT NULL,
    \`type\` ENUM('INBOX', 'SENT', 'DRAFTS', 'SPAM', 'TRASH', 'CUSTOM') NOT NULL DEFAULT 'CUSTOM',
    \`sort_order\` INT NOT NULL DEFAULT 0,
    \`is_system\` BOOLEAN NOT NULL DEFAULT FALSE,
    \`uidvalidity\` INT UNSIGNED NOT NULL DEFAULT 1,
    \`uidnext\` INT UNSIGNED NOT NULL DEFAULT 1,
    \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`fk_folder_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`user\`(\`id\`) ON DELETE CASCADE,
    CONSTRAINT \`fk_folder_parent\` FOREIGN KEY (\`parent_id\`) REFERENCES \`mail_folder\`(\`id\`) ON DELETE CASCADE,
    INDEX \`idx_folder_user_parent\` (\`user_id\`, \`parent_id\`),
    INDEX \`idx_folder_user_type\` (\`user_id\`, \`type\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS \`user_mail\` (
    \`id\` VARCHAR(36) PRIMARY KEY,
    \`user_id\` VARCHAR(36) NOT NULL,
    \`folder_id\` VARCHAR(36) NOT NULL,
    \`message_id\` VARCHAR(36) NOT NULL,
    \`uid\` INT UNSIGNED NOT NULL DEFAULT 1,
    \`is_read\` BOOLEAN NOT NULL DEFAULT FALSE,
    \`is_seen\` BOOLEAN NOT NULL DEFAULT FALSE,
    \`is_starred\` BOOLEAN NOT NULL DEFAULT FALSE,
    \`is_deleted\` BOOLEAN NOT NULL DEFAULT FALSE,
    \`is_answered\` BOOLEAN NOT NULL DEFAULT FALSE,
    \`is_draft\` BOOLEAN NOT NULL DEFAULT FALSE,
    \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT \`fk_user_mail_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`user\`(\`id\`) ON DELETE CASCADE,
    CONSTRAINT \`fk_user_mail_folder\` FOREIGN KEY (\`folder_id\`) REFERENCES \`mail_folder\`(\`id\`) ON DELETE CASCADE,
    CONSTRAINT \`fk_user_mail_message\` FOREIGN KEY (\`message_id\`) REFERENCES \`mail_message\`(\`id\`) ON DELETE CASCADE,
    INDEX \`idx_user_folder_created\` (\`user_id\`, \`folder_id\`, \`created_at\` DESC),
    INDEX \`idx_user_message\` (\`user_id\`, \`message_id\`),
    UNIQUE INDEX \`idx_folder_uid\` (\`folder_id\`, \`uid\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS \`system_settings\` (
    \`id\` VARCHAR(36) PRIMARY KEY,
    \`category\` ENUM('SERVER', 'SMTP_INBOUND', 'SMTP_OUTBOUND', 'AUTH', 'INFRA') NOT NULL DEFAULT 'SERVER',
    \`key\` VARCHAR(100) NOT NULL UNIQUE,
    \`value\` TEXT NULL,
    \`value_type\` ENUM('string', 'number', 'boolean', 'json') NOT NULL DEFAULT 'string',
    \`is_encrypted\` BOOLEAN NOT NULL DEFAULT FALSE,
    \`is_secret\` BOOLEAN NOT NULL DEFAULT FALSE,
    \`restart_required\` ENUM('NONE', 'SOFT', 'HARD') NOT NULL DEFAULT 'NONE',
    \`target_module\` ENUM('NONE', 'SMTP_INGESTION', 'HARAKA', 'API_SERVER', 'IMAP') NOT NULL DEFAULT 'NONE',
    \`description\` VARCHAR(255) NULL,
    \`updated_by\` VARCHAR(36) NULL,
    \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX \`idx_settings_category\` (\`category\`),
    INDEX \`idx_settings_key\` (\`key\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS \`system_licenses\` (
    \`id\` VARCHAR(36) PRIMARY KEY,
    \`license_id\` VARCHAR(64) NOT NULL UNIQUE,
    \`product\` VARCHAR(50) NOT NULL DEFAULT 'LEMail',
    \`organization_name\` VARCHAR(100) NOT NULL,
    \`max_users\` INT NOT NULL DEFAULT 200,
    \`register_expires_at\` DATETIME NULL,
    \`expires_at\` DATETIME NULL,
    \`is_unlimited\` BOOLEAN NOT NULL DEFAULT FALSE,
    \`issued_at\` DATETIME NOT NULL,
    \`file_hash\` VARCHAR(64) NOT NULL,
    \`license_raw\` TEXT NOT NULL,
    \`signature\` TEXT NOT NULL,
    \`is_active\` BOOLEAN NOT NULL DEFAULT TRUE,
    \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX \`idx_license_id\` (\`license_id\`),
    INDEX \`idx_license_is_active\` (\`is_active\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS \`mail_backup\` (
    \`id\` VARCHAR(36) PRIMARY KEY,
    \`user_id\` VARCHAR(36) NOT NULL,
    \`folder_id\` VARCHAR(36) NULL,
    \`folder_name\` VARCHAR(100) NOT NULL,
    \`status\` ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
    \`total_count\` INT NOT NULL DEFAULT 0,
    \`file_size_bytes\` BIGINT NOT NULL DEFAULT 0,
    \`file_path\` VARCHAR(500) NULL,
    \`download_token\` VARCHAR(128) NOT NULL UNIQUE,
    \`error_message\` TEXT NULL,
    \`expires_at\` TIMESTAMP NOT NULL,
    \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`fk_backup_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`user\`(\`id\`) ON DELETE CASCADE,
    INDEX \`idx_backup_user_created\` (\`user_id\`, \`created_at\`),
    INDEX \`idx_backup_token\` (\`download_token\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS \`contact_group\` (
    \`id\` VARCHAR(36) PRIMARY KEY,
    \`user_id\` VARCHAR(36) NOT NULL,
    \`name\` VARCHAR(100) NOT NULL,
    \`color\` VARCHAR(20) DEFAULT '#0284c7',
    \`sort_order\` INT DEFAULT 0,
    \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX \`idx_cg_user\` (\`user_id\`),
    CONSTRAINT \`fk_cg_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`user\`(\`id\`) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS \`contact\` (
    \`id\` VARCHAR(36) PRIMARY KEY,
    \`user_id\` VARCHAR(36) NOT NULL,
    \`group_id\` VARCHAR(36) NULL,
    \`name\` VARCHAR(100) NOT NULL,
    \`email\` VARCHAR(255) NULL,
    \`phone\` VARCHAR(50) NULL,
    \`company\` VARCHAR(100) NULL,
    \`department\` VARCHAR(100) NULL,
    \`position\` VARCHAR(100) NULL,
    \`company_phone\` VARCHAR(50) NULL,
    \`company_fax\` VARCHAR(50) NULL,
    \`mobile_country_code\` VARCHAR(10) NULL DEFAULT '+82',
    \`birthday\` VARCHAR(20) NULL,
    \`postal_code\` VARCHAR(20) NULL,
    \`address\` VARCHAR(255) NULL,
    \`address_detail\` VARCHAR(255) NULL,
    \`website_url\` VARCHAR(255) NULL,
    \`memo\` TEXT NULL,
    \`is_starred\` BOOLEAN DEFAULT FALSE,
    \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX \`idx_c_user\` (\`user_id\`),
    INDEX \`idx_c_user_email\` (\`user_id\`, \`email\`),
    INDEX \`idx_c_user_name\` (\`user_id\`, \`name\`),
    INDEX \`idx_c_group\` (\`group_id\`),
    CONSTRAINT \`fk_c_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`user\`(\`id\`) ON DELETE CASCADE,
    CONSTRAINT \`fk_c_group\` FOREIGN KEY (\`group_id\`) REFERENCES \`contact_group\`(\`id\`) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS \`calendar\` (
    \`id\` VARCHAR(36) PRIMARY KEY,
    \`user_id\` VARCHAR(36) NOT NULL,
    \`name\` VARCHAR(100) NOT NULL,
    \`color\` VARCHAR(20) NOT NULL DEFAULT '#0284c7',
    \`type\` ENUM('PERSONAL', 'SHARED', 'HOLIDAY') NOT NULL DEFAULT 'PERSONAL',
    \`is_default\` BOOLEAN NOT NULL DEFAULT FALSE,
    \`is_visible\` BOOLEAN NOT NULL DEFAULT TRUE,
    \`sort_order\` INT NOT NULL DEFAULT 0,
    \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX \`idx_calendar_user\` (\`user_id\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS \`calendar_event\` (
    \`id\` VARCHAR(36) PRIMARY KEY,
    \`calendar_id\` VARCHAR(36) NOT NULL,
    \`user_id\` VARCHAR(36) NOT NULL,
    \`title\` VARCHAR(255) NOT NULL,
    \`description\` TEXT NULL,
    \`location\` VARCHAR(255) NULL,
    \`start_at\` DATETIME NOT NULL,
    \`end_at\` DATETIME NOT NULL,
    \`is_all_day\` BOOLEAN NOT NULL DEFAULT FALSE,
    \`timezone\` VARCHAR(50) NOT NULL DEFAULT 'Asia/Seoul',
    \`rrule\` VARCHAR(255) NULL,
    \`recurrence_end_at\` DATETIME NULL,
    \`reminder_minutes_before\` INT NULL,
    \`reminder_sent_at\` DATETIME NULL,
    \`source_mail_id\` VARCHAR(36) NULL,
    \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX \`idx_ce_calendar\` (\`calendar_id\`),
    INDEX \`idx_ce_user_range\` (\`user_id\`, \`start_at\`, \`end_at\`),
    CONSTRAINT \`fk_ce_calendar\` FOREIGN KEY (\`calendar_id\`) REFERENCES \`calendar\`(\`id\`) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS \`calendar_event_attendee\` (
    \`id\` VARCHAR(36) PRIMARY KEY,
    \`event_id\` VARCHAR(36) NOT NULL,
    \`email\` VARCHAR(255) NOT NULL,
    \`name\` VARCHAR(100) NULL,
    \`rsvp_status\` ENUM('PENDING', 'ACCEPTED', 'DECLINED', 'TENTATIVE') NOT NULL DEFAULT 'PENDING',
    \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX \`idx_cea_event\` (\`event_id\`),
    CONSTRAINT \`fk_cea_event\` FOREIGN KEY (\`event_id\`) REFERENCES \`calendar_event\`(\`id\`) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS \`system_holiday\` (
    \`id\` VARCHAR(36) PRIMARY KEY,
    \`holiday_date\` VARCHAR(10) NOT NULL,
    \`year\` INT NOT NULL,
    \`name\` VARCHAR(100) NOT NULL,
    \`is_substitute\` BOOLEAN NOT NULL DEFAULT FALSE,
    \`source\` ENUM('SEED', 'KASI_API', 'ICS_IMPORT', 'ADMIN_MANUAL') NOT NULL DEFAULT 'SEED',
    \`is_active\` BOOLEAN NOT NULL DEFAULT TRUE,
    \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX \`idx_sh_year\` (\`year\`),
    UNIQUE INDEX \`idx_sh_date_name\` (\`holiday_date\`, \`name\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
];

async function run() {
  console.log('Connecting to MySQL database...');
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3300', 10),
    user: process.env.DB_USERNAME || 'lemail',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'lemaildb',
  });

  console.log('Connected! Executing schema initializations...');
  for (const statement of schemaStatements) {
    await conn.query(statement);
  }
  console.log('All tables created successfully!');

  // Migrate user table columns if missing
  const alterColumns = [
    { name: 'mailbox_quota_mb', ddl: 'ALTER TABLE `user` ADD COLUMN `mailbox_quota_mb` INT NOT NULL DEFAULT 512 AFTER `is_active`;' },
    { name: 'preferred_language', ddl: 'ALTER TABLE `user` ADD COLUMN `preferred_language` VARCHAR(20) NOT NULL DEFAULT "ko" AFTER `mailbox_quota_mb`;' },
    { name: 'timezone', ddl: 'ALTER TABLE `user` ADD COLUMN `timezone` VARCHAR(50) NOT NULL DEFAULT "Asia/Seoul" AFTER `preferred_language`;' },
    { name: 'employee_id', ddl: 'ALTER TABLE `user` ADD COLUMN `employee_id` VARCHAR(50) NULL AFTER `timezone`;' },
    { name: 'use_signature', ddl: 'ALTER TABLE `user` ADD COLUMN `use_signature` BOOLEAN NOT NULL DEFAULT FALSE AFTER `last_login_at`;' },
    { name: 'signature_html', ddl: 'ALTER TABLE `user` ADD COLUMN `signature_html` MEDIUMTEXT NULL AFTER `use_signature`;' },
  ];

  for (const col of alterColumns) {
    try {
      await conn.query(col.ddl);
      console.log(`Added column ${col.name} to user table.`);
    } catch (err: any) {
      if (err.errno === 1060) {
        // Duplicate column name, already exists
      } else {
        console.warn(`Column migration note for ${col.name}: ${err.message}`);
      }
    }
  }

  // Migrate mail_message columns (failure_reason for outbound mail tracking)
  const messageColumns = [
    {
      name: 'failure_reason',
      ddl: 'ALTER TABLE `mail_message` ADD COLUMN `failure_reason` TEXT NULL AFTER `status`;',
    },
    {
      name: 'is_secure',
      ddl: 'ALTER TABLE `mail_message` ADD COLUMN `is_secure` BOOLEAN NOT NULL DEFAULT FALSE AFTER `failure_reason`;',
    },
    {
      name: 'is_important',
      ddl: 'ALTER TABLE `mail_message` ADD COLUMN `is_important` BOOLEAN NOT NULL DEFAULT FALSE AFTER `is_secure`;',
    },
  ];

  for (const col of messageColumns) {
    try {
      await conn.query(col.ddl);
      console.log(`Added column ${col.name} to mail_message table.`);
    } catch (err: any) {
      if (err.errno === 1060) {
        // Already exists
      } else {
        console.warn(`Column migration note for mail_message.${col.name}: ${err.message}`);
      }
    }
  }

  // Migrate mail_folder columns for IMAP
  const folderColumns = [
    { name: 'uidvalidity', ddl: 'ALTER TABLE `mail_folder` ADD COLUMN `uidvalidity` INT UNSIGNED NOT NULL DEFAULT 1 AFTER `is_system`;' },
    { name: 'uidnext', ddl: 'ALTER TABLE `mail_folder` ADD COLUMN `uidnext` INT UNSIGNED NOT NULL DEFAULT 1 AFTER `uidvalidity`;' },
  ];

  for (const col of folderColumns) {
    try {
      await conn.query(col.ddl);
      console.log(`Added column ${col.name} to mail_folder table.`);
    } catch (err: any) {
      if (err.errno === 1060) {
        // Already exists
      } else {
        console.warn(`Column migration note for mail_folder.${col.name}: ${err.message}`);
      }
    }
  }

  // Update uidvalidity with timestamp if it's 1
  try {
    await conn.query('UPDATE `mail_folder` SET `uidvalidity` = UNIX_TIMESTAMP() WHERE `uidvalidity` <= 1;');
  } catch (err: any) {
    console.warn('Note updating mail_folder uidvalidity:', err.message);
  }

  // Migrate user_mail columns for IMAP
  const userMailColumns = [
    { name: 'uid', ddl: 'ALTER TABLE `user_mail` ADD COLUMN `uid` INT UNSIGNED NOT NULL DEFAULT 1 AFTER `message_id`;' },
    { name: 'is_seen', ddl: 'ALTER TABLE `user_mail` ADD COLUMN `is_seen` BOOLEAN NOT NULL DEFAULT FALSE AFTER `is_read`;' },
    { name: 'is_deleted', ddl: 'ALTER TABLE `user_mail` ADD COLUMN `is_deleted` BOOLEAN NOT NULL DEFAULT FALSE AFTER `is_starred`;' },
    { name: 'is_answered', ddl: 'ALTER TABLE `user_mail` ADD COLUMN `is_answered` BOOLEAN NOT NULL DEFAULT FALSE AFTER `is_deleted`;' },
    { name: 'is_forwarded', ddl: 'ALTER TABLE `user_mail` ADD COLUMN `is_forwarded` BOOLEAN NOT NULL DEFAULT FALSE AFTER `is_answered`;' },
    { name: 'is_draft', ddl: 'ALTER TABLE `user_mail` ADD COLUMN `is_draft` BOOLEAN NOT NULL DEFAULT FALSE AFTER `is_forwarded`;' },
  ];

  for (const col of userMailColumns) {
    try {
      await conn.query(col.ddl);
      console.log(`Added column ${col.name} to user_mail table.`);
    } catch (err: any) {
      if (err.errno === 1060) {
        // Already exists
      } else {
        console.warn(`Column migration note for user_mail.${col.name}: ${err.message}`);
      }
    }
  }

  // Backfill sequential UID per folder for existing user_mail records
  console.log('Checking and backfilling user_mail UIDs per folder...');
  const [folders] = (await conn.query('SELECT `id` FROM `mail_folder`;')) as any;
  for (const f of folders) {
    const [mails] = (await conn.query(
      'SELECT `id`, `uid` FROM `user_mail` WHERE `folder_id` = ? ORDER BY `created_at` ASC, `id` ASC;',
      [f.id],
    )) as any;

    if (mails && mails.length > 0) {
      let currentSeq = 1;
      for (const m of mails) {
        await conn.query('UPDATE `user_mail` SET `uid` = ? WHERE `id` = ?;', [currentSeq, m.id]);
        currentSeq++;
      }
      await conn.query('UPDATE `mail_folder` SET `uidnext` = ? WHERE `id` = ?;', [currentSeq, f.id]);
    }
  }

  // Ensure unique index idx_folder_uid on user_mail
  try {
    await conn.query('ALTER TABLE `user_mail` ADD UNIQUE INDEX `idx_folder_uid` (`folder_id`, `uid`);');
    console.log('Created unique index idx_folder_uid on user_mail.');
  } catch (err: any) {
    if (err.errno === 1061) {
      // Duplicate key name, index already exists
    } else {
      console.warn('Index migration note for idx_folder_uid:', err.message);
    }
  }

  // Ensure contact.email allows NULL (e.g. for phone-only contacts from Google/smartphones)
  try {
    await conn.query('ALTER TABLE `contact` MODIFY COLUMN `email` VARCHAR(255) NULL;');
    console.log('Modified contact.email to allow NULL.');
  } catch (err: any) {
    console.warn(`Column migration note for contact.email: ${err.message}`);
  }

  // Migrate contact table new columns for Excel structure
  const contactNewColumns = [
    { name: 'company_phone', ddl: 'ALTER TABLE `contact` ADD COLUMN `company_phone` VARCHAR(50) NULL AFTER `position`;' },
    { name: 'company_fax', ddl: 'ALTER TABLE `contact` ADD COLUMN `company_fax` VARCHAR(50) NULL AFTER `company_phone`;' },
    { name: 'mobile_country_code', ddl: 'ALTER TABLE `contact` ADD COLUMN `mobile_country_code` VARCHAR(10) NULL DEFAULT "+82" AFTER `company_fax`;' },
    { name: 'birthday', ddl: 'ALTER TABLE `contact` ADD COLUMN `birthday` VARCHAR(20) NULL AFTER `phone`;' },
    { name: 'postal_code', ddl: 'ALTER TABLE `contact` ADD COLUMN `postal_code` VARCHAR(20) NULL AFTER `birthday`;' },
    { name: 'address', ddl: 'ALTER TABLE `contact` ADD COLUMN `address` VARCHAR(255) NULL AFTER `postal_code`;' },
    { name: 'address_detail', ddl: 'ALTER TABLE `contact` ADD COLUMN `address_detail` VARCHAR(255) NULL AFTER `address`;' },
    { name: 'website_url', ddl: 'ALTER TABLE `contact` ADD COLUMN `website_url` VARCHAR(255) NULL AFTER `address_detail`;' },
  ];

  for (const col of contactNewColumns) {
    try {
      await conn.query(col.ddl);
      console.log(`Added column ${col.name} to contact table.`);
    } catch (err: any) {
      if (err.errno === 1060) {
        // Already exists
      } else {
        console.warn(`Column migration note for contact.${col.name}: ${err.message}`);
      }
    }
  }

  // Drop deprecated is_public column if exists
  try {
    await conn.query('ALTER TABLE `contact` DROP COLUMN `is_public`;');
    console.log('Dropped deprecated column is_public from contact table.');
  } catch (err: any) {
    if (err.errno === 1091) {
      // Column does not exist
    } else {
      console.warn(`Column drop note for contact.is_public: ${err.message}`);
    }
  }

  // Migrate calendar_event columns (rrule, recurrence_end_at, reminder_minutes_before, reminder_sent_at)
  const calendarEventColumns = [
    { name: 'rrule', ddl: 'ALTER TABLE `calendar_event` ADD COLUMN `rrule` VARCHAR(255) NULL AFTER `timezone`;' },
    { name: 'recurrence_end_at', ddl: 'ALTER TABLE `calendar_event` ADD COLUMN `recurrence_end_at` DATETIME NULL AFTER `rrule`;' },
    { name: 'reminder_minutes_before', ddl: 'ALTER TABLE `calendar_event` ADD COLUMN `reminder_minutes_before` INT NULL AFTER `recurrence_end_at`;' },
    { name: 'reminder_sent_at', ddl: 'ALTER TABLE `calendar_event` ADD COLUMN `reminder_sent_at` DATETIME NULL AFTER `reminder_minutes_before`;' },
  ];

  for (const col of calendarEventColumns) {
    try {
      await conn.query(col.ddl);
      console.log(`Added column ${col.name} to calendar_event table.`);
    } catch (err: any) {
      if (err.errno !== 1060) {
        console.warn(`Column migration note for calendar_event.${col.name}: ${err.message}`);
      }
    }
  }

  const [tables] = await conn.query('SHOW TABLES;');
  console.log('Current tables:', tables);

  await conn.end();
}

run().catch((err) => {
  console.error('Schema initialization failed:', err);
  process.exit(1);
});
