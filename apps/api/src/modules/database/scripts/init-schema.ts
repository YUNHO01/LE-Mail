import * as mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

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
    { name: 'is_deleted', ddl: 'ALTER TABLE `user_mail` ADD COLUMN `is_deleted` BOOLEAN NOT NULL DEFAULT FALSE AFTER `is_starred`;' },
    { name: 'is_answered', ddl: 'ALTER TABLE `user_mail` ADD COLUMN `is_answered` BOOLEAN NOT NULL DEFAULT FALSE AFTER `is_deleted`;' },
    { name: 'is_draft', ddl: 'ALTER TABLE `user_mail` ADD COLUMN `is_draft` BOOLEAN NOT NULL DEFAULT FALSE AFTER `is_answered`;' },
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

  const [tables] = await conn.query('SHOW TABLES;');
  console.log('Current tables:', tables);

  await conn.end();
}

run().catch((err) => {
  console.error('Schema initialization failed:', err);
  process.exit(1);
});
