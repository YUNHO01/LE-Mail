export const UserRole = {
  SYSTEM_ADMIN: 'SYSTEM_ADMIN',
  USER: 'USER',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const Direction = {
  INBOUND: 'INBOUND',
  OUTBOUND: 'OUTBOUND',
} as const;
export type Direction = (typeof Direction)[keyof typeof Direction];

export const MailStatus = {
  QUEUED: 'QUEUED',
  PROCESSED: 'PROCESSED',
  FAILED: 'FAILED',
} as const;
export type MailStatus = (typeof MailStatus)[keyof typeof MailStatus];

export const SpfResult = {
  PASS: 'PASS',
  FAIL: 'FAIL',
  SOFTFAIL: 'SOFTFAIL',
  NEUTRAL: 'NEUTRAL',
  NONE: 'NONE',
} as const;
export type SpfResult = (typeof SpfResult)[keyof typeof SpfResult];

export const DkimResult = {
  PASS: 'PASS',
  FAIL: 'FAIL',
  NONE: 'NONE',
} as const;
export type DkimResult = (typeof DkimResult)[keyof typeof DkimResult];

export const DmarcResult = {
  PASS: 'PASS',
  FAIL: 'FAIL',
  NONE: 'NONE',
} as const;
export type DmarcResult = (typeof DmarcResult)[keyof typeof DmarcResult];

export const RecipientType = {
  TO: 'TO',
  CC: 'CC',
  BCC: 'BCC',
} as const;
export type RecipientType = (typeof RecipientType)[keyof typeof RecipientType];

export const FolderType = {
  INBOX: 'INBOX',
  SENT: 'SENT',
  DRAFTS: 'DRAFTS',
  SPAM: 'SPAM',
  TRASH: 'TRASH',
  CUSTOM: 'CUSTOM',
} as const;
export type FolderType = (typeof FolderType)[keyof typeof FolderType];

export interface MailFolderDto {
  id: string;
  userId: string;
  parentId: string | null;
  name: string;
  type: FolderType;
  sortOrder: number;
  isSystem: boolean;
  uidvalidity?: number;
  uidnext?: number;
  createdAt: string;
  updatedAt: string;
  unreadCount?: number;
  totalCount?: number;
  children?: MailFolderDto[];
}

export interface CreateMailFolderDto {
  name: string;
  parentId?: string | null;
  sortOrder?: number;
}

export interface UpdateMailFolderDto {
  name?: string;
  parentId?: string | null;
  sortOrder?: number;
}

export interface MoveMailDto {
  targetFolderId: string;
}

export interface UserDto {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  mailboxQuotaMb: number;
  usedBytes?: number;
  usedMb?: number;
  usagePercent?: number;
  messageCount?: number;
  preferredLanguage: string;
  timezone: string;
  employeeId: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserStorageUsageDto {
  quotaMb: number;
  usedBytes: number;
  usedMb: number;
  usagePercent: number;
  messageCount: number;
  freeMb: number;
}

export interface CreateUserDto {
  email: string;
  name: string;
  password: string;
  role?: UserRole;
  mailboxQuotaMb?: number;
  preferredLanguage?: string;
  timezone?: string;
  employeeId?: string | null;
}

export interface UpdateUserDto {
  name?: string;
  password?: string;
  role?: UserRole;
  isActive?: boolean;
  mailboxQuotaMb?: number;
  preferredLanguage?: string;
  timezone?: string;
  employeeId?: string | null;
}

export interface LoginResponseDto {
  accessToken: string;
  user: UserDto;
}

export interface MailboxDto {
  id: string;
  email: string;
  domain: string;
  isActive: boolean;
  createdAt: string;
}

export interface DomainDto {
  id: string;
  name: string;
  isActive: boolean;
  isDefault: boolean;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  mailboxCount?: number;
}

export interface CreateDomainDto {
  name: string;
  description?: string;
  isDefault?: boolean;
  isActive?: boolean;
}

export interface UpdateDomainDto {
  description?: string;
  isDefault?: boolean;
  isActive?: boolean;
}

export interface MailRecipientDto {
  id: string;
  messageId: string;
  type: RecipientType;
  address: string;
}

export interface MailAttachmentDto {
  id: string;
  messageId: string;
  filename: string;
  contentType: string;
  sizeBytes: string;
  storagePath: string;
}

export interface MailMessageDto {
  id: string;
  direction: Direction;
  messageId: string | null;
  sender: string;
  subject: string | null;
  rawFilePath: string;
  spfResult: SpfResult;
  dkimResult: DkimResult;
  dmarcResult: DmarcResult;
  status: MailStatus;
  failureReason?: string | null;
  createdAt: string;
  uid?: number;
  isRead?: boolean;
  isStarred?: boolean;
  isDeleted?: boolean;
  isAnswered?: boolean;
  isDraft?: boolean;
  recipients?: MailRecipientDto[];
  attachments?: MailAttachmentDto[];
  body?: {
    text: string | null;
    html: string | null;
  };
}

export interface QueueCounts {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export interface ImapStatsDto {
  activeConnections: number;
  maxConnections: number;
  isHealthy: boolean;
}

export interface TodayMailStatsDto {
  todayTotal: number;
  todayProcessed: number;
  todayFailed: number;
  todayInboundTotal?: number;
  todayInboundFailed?: number;
  todayOutboundTotal?: number;
  todayOutboundFailed?: number;
}

export interface SystemOverviewDto {
  uptimeSeconds: number;
  memory: {
    rssMb: number;
    heapUsedMb: number;
    heapTotalMb: number;
  };
  queue: {
    queueName: string;
    isPaused: boolean;
    counts: QueueCounts;
  };
  imap: ImapStatsDto;
  todayMails: TodayMailStatsDto;
  mailSummary: {
    totalMails?: number;
    processedMails?: number;
    failedMails?: number;
    activeMailboxes: number;
  };
}

export interface SendMailAttachmentDto {
  id?: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  storagePath?: string;
}

export interface SendMailDto {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyText?: string;
  bodyHtml: string;
  attachments?: SendMailAttachmentDto[];
}

export interface SaveDraftDto {
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  bodyText?: string;
  bodyHtml?: string;
  draftId?: string;
}

export interface SendMailResponseDto {
  success: boolean;
  messageId: string;
  mailId: string;
  failureReason?: string | null;
}

export interface RetryMailResponseDto {
  success: boolean;
  mailId: string;
  messageId?: string | null;
  status: MailStatus;
  failureReason?: string | null;
}

export interface BulkRetryResponseDto {
  total: number;
  succeeded: number;
  failed: number;
  results: {
    mailId: string;
    success: boolean;
    failureReason?: string | null;
  }[];
}

export const SettingCategory = {
  SERVER: 'SERVER',
  SMTP_INBOUND: 'SMTP_INBOUND',
  SMTP_OUTBOUND: 'SMTP_OUTBOUND',
  AUTH: 'AUTH',
  INFRA: 'INFRA',
} as const;
export type SettingCategory = (typeof SettingCategory)[keyof typeof SettingCategory];

export const RestartLevel = {
  NONE: 'NONE',
  SOFT: 'SOFT',
  HARD: 'HARD',
} as const;
export type RestartLevel = (typeof RestartLevel)[keyof typeof RestartLevel];

export const TargetModule = {
  NONE: 'NONE',
  SMTP_INGESTION: 'SMTP_INGESTION',
  HARAKA: 'HARAKA',
  API_SERVER: 'API_SERVER',
  IMAP: 'IMAP',
} as const;
export type TargetModule = (typeof TargetModule)[keyof typeof TargetModule];

export interface SystemSettingItemDto {
  id: string;
  category: SettingCategory;
  key: string;
  value: string | null;
  valueType: 'string' | 'number' | 'boolean' | 'json';
  isEncrypted: boolean;
  isSecret: boolean;
  restartRequired: RestartLevel;
  targetModule: TargetModule;
  description: string | null;
  updatedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StepSettingsDto {
  step: number;
  category: SettingCategory;
  categoryLabel: string;
  settings: Record<string, any>;
}

export interface SaveStepSettingsResponseDto {
  success: boolean;
  message: string;
  step: number;
  category: SettingCategory;
  requiresRestart: boolean;
  restartLevel: RestartLevel;
  targetModules: TargetModule[];
  changedKeys: string[];
}

