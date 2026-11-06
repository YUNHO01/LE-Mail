import * as mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const schemaStatements = [
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
    \`last_login_at\` TIMESTAMP NULL,
    \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX \`idx_user_email\` (\`email\`),
    INDEX \`idx_user_role\` (\`role\`)
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
    \`is_read\` BOOLEAN NOT NULL DEFAULT FALSE,
    \`is_starred\` BOOLEAN NOT NULL DEFAULT FALSE,
    \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT \`fk_user_mail_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`user\`(\`id\`) ON DELETE CASCADE,
    CONSTRAINT \`fk_user_mail_folder\` FOREIGN KEY (\`folder_id\`) REFERENCES \`mail_folder\`(\`id\`) ON DELETE CASCADE,
    CONSTRAINT \`fk_user_mail_message\` FOREIGN KEY (\`message_id\`) REFERENCES \`mail_message\`(\`id\`) ON DELETE CASCADE,
    INDEX \`idx_user_folder_created\` (\`user_id\`, \`folder_id\`, \`created_at\` DESC),
    INDEX \`idx_user_message\` (\`user_id\`, \`message_id\`)
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

  const [tables] = await conn.query('SHOW TABLES;');
  console.log('Current tables:', tables);

  await conn.end();
}

run().catch((err) => {
  console.error('Schema initialization failed:', err);
  process.exit(1);
});
