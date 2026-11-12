export interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  poolSize: number;
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
}

export interface SmtpConfig {
  port: number;
  spoolDir: string;
  archiveDir: string;
  spoolCleanup: boolean;
  useProxy: boolean;
  maxClients: number;
  cacheTtlSeconds: number;
  rblEnabled: boolean;
  rblServers: string;
}

export interface AuthConfig {
  jwtSecret: string;
  jwtExpiresIn: string;
}

export interface DefaultAdminConfig {
  email: string;
  password: string;
  name: string;
}

export interface AppConfig {
  port: number;
  workerConcurrency: number;
  smtp: SmtpConfig;
  database: DatabaseConfig;
  redis: RedisConfig;
  auth: AuthConfig;
  defaultAdmin: DefaultAdminConfig;
}

export default (): AppConfig => ({
  port: parseInt(process.env.PORT || '9200', 10),
  workerConcurrency: parseInt(process.env.WORKER_CONCURRENCY || '5', 10),
  smtp: {
    port: parseInt(process.env.SMTP_PORT || '2525', 10),
    spoolDir: process.env.MAIL_SPOOL_DIR || process.env.SPOOL_DIR || './mail-spool',
    archiveDir: process.env.MAIL_ARCHIVE_DIR || process.env.ARCHIVE_DIR || './mail-archive',
    spoolCleanup: process.env.MAIL_SPOOL_CLEANUP === 'true',
    useProxy: process.env.SMTP_USE_PROXY === 'true',
    maxClients: parseInt(process.env.SMTP_MAX_CLIENTS || '100', 10),
    cacheTtlSeconds: parseInt(process.env.MAILBOX_CACHE_TTL || '60', 10),
    rblEnabled: process.env.SMTP_RBL_ENABLED !== 'false',
    rblServers:
      process.env.SMTP_RBL_SERVERS || 'zen.spamhaus.org,spamlist.or.kr',
  },
  database: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3300', 10),
    username: process.env.DB_USERNAME || 'lemail',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'lemaildb',
    poolSize: parseInt(process.env.DB_POOL_SIZE || '20', 10),
  },
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  auth: {
    jwtSecret: process.env.JWT_SECRET || 'lemail_super_secret_jwt_key_2026!',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  },
  defaultAdmin: {
    email: process.env.DEFAULT_ADMIN_EMAIL || 'admin@lineedge.com',
    password: process.env.DEFAULT_ADMIN_PASSWORD || 'admin1234!',
    name: process.env.DEFAULT_ADMIN_NAME || '시스템관리자',
  },
});
