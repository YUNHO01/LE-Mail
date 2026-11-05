import * as Joi from 'joi';

export const validationSchema = Joi.object({
  PORT: Joi.number().default(9200),
  WORKER_CONCURRENCY: Joi.number().default(5),

  SMTP_PORT: Joi.number().default(2525),
  MAIL_SPOOL_DIR: Joi.string().default('./mail-spool'),
  MAIL_ARCHIVE_DIR: Joi.string().default('./mail-archive'),
  MAIL_SPOOL_CLEANUP: Joi.boolean().default(false),
  SMTP_USE_PROXY: Joi.boolean().default(false),
  SMTP_MAX_CLIENTS: Joi.number().default(100),
  MAILBOX_CACHE_TTL: Joi.number().default(60),

  DB_HOST: Joi.string().default('127.0.0.1'),
  DB_PORT: Joi.number().default(3300),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_DATABASE: Joi.string().required(),
  DB_POOL_SIZE: Joi.number().default(20),

  REDIS_HOST: Joi.string().default('127.0.0.1'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),

  DEFAULT_ADMIN_EMAIL: Joi.string().email().default('admin@lineedge.com'),
  DEFAULT_ADMIN_PASSWORD: Joi.string().default('admin1234!'),
  DEFAULT_ADMIN_NAME: Joi.string().default('시스템관리자'),
  JWT_SECRET: Joi.string().default('lemail_super_secret_jwt_key_2026!'),
  JWT_EXPIRES_IN: Joi.string().default('1d'),
});
