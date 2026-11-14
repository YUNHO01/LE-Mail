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
  QUARANTINED: 'QUARANTINED',
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

export type OrgSyncSource = 'LOCAL' | 'AMS';
export type EmploymentStatus = 'ACTIVE' | 'ON_LEAVE' | 'RESIGNED';
export type OrgSyncType = 'FULL' | 'INCREMENTAL' | 'WEBHOOK';
export type OrgSyncStatus = 'RUNNING' | 'SUCCESS' | 'PARTIAL' | 'FAILED';

export interface DepartmentDto {
  id: string;
  code: string | null;
  amsDeptId: string | null;
  parentId: string | null;
  name: string;
  depth: number;
  path: string | null;
  sortOrder: number;
  managerEmployeeId: string | null;
  source: OrgSyncSource;
  isActive: boolean;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
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
  amsUserId?: string | null;
  departmentId?: string | null;
  departmentName?: string | null;
  position?: string | null;
  jobTitle?: string | null;
  phone?: string | null;
  mobile?: string | null;
  syncSource?: OrgSyncSource;
  employmentStatus?: EmploymentStatus;
  resignedAt?: string | null;
  lastSyncedAt?: string | null;
  lastLoginAt: string | null;
  useSignature?: boolean;
  signatureHtml?: string | null;
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
  departmentId?: string | null;
  position?: string | null;
  jobTitle?: string | null;
  phone?: string | null;
  mobile?: string | null;
  employmentStatus?: EmploymentStatus;
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
  departmentId?: string | null;
  position?: string | null;
  jobTitle?: string | null;
  phone?: string | null;
  mobile?: string | null;
  employmentStatus?: EmploymentStatus;
}

export interface LoginResponseDto {
  accessToken: string;
  user: UserDto;
}

export interface PasskeyCredentialDto {
  id: string;
  credentialId: string;
  deviceName: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface WebAuthnRegisterOptionsResponseDto {
  challenge: string;
  rp: {
    name: string;
    id: string;
  };
  user: {
    id: string;
    name: string;
    displayName: string;
  };
  pubKeyCredParams: Array<{ type: 'public-key'; alg: number }>;
  timeout: number;
  attestation: 'none';
  authenticatorSelection: {
    authenticatorAttachment?: 'platform';
    residentKey?: 'preferred' | 'required';
    userVerification: 'required' | 'preferred';
  };
  excludeCredentials: Array<{ id: string; type: 'public-key' }>;
}

export interface WebAuthnLoginOptionsResponseDto {
  challengeToken: string;
  challenge: string;
  rpId: string;
  timeout: number;
  userVerification: 'required' | 'preferred';
  allowCredentials: Array<{ id: string; type: 'public-key'; transports?: string[] }>;
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
  dkimSelector?: string | null;
  dkimPublicKey?: string | null;
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
  spamScore?: number;
  spamReasons?: string[];
  failureReason?: string | null;
  createdAt: string;
  folderId?: string;
  uid?: number;
  isRead?: boolean;
  isSeen?: boolean;
  isNew?: boolean;
  isStarred?: boolean;
  isDeleted?: boolean;
  isAnswered?: boolean;
  isForwarded?: boolean;
  isDraft?: boolean;
  isSecure?: boolean;
  isImportant?: boolean;
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
  todayQuarantined?: number;
  todaySpamBlocked?: number;
  todaySpamRate?: number;
}

export interface ClamavHealthStatusDto {
  enabled: boolean;
  isHealthy: boolean;
  host: string;
  port: number;
  version?: string;
  latencyMs?: number;
  errorMessage?: string;
  checkedAt?: string;
}

export interface SpamPolicyConfigDto {
  spamScoreThreshold: number;
  quarantineScoreThreshold: number;
  outboundRateLimitMinute: number;
  outboundRateLimitDay: number;
  quarantineRetentionDays: number;
  clamavEnabled: boolean;
  clamavHost?: string;
  clamavPort?: number;
  clamavTimeoutMs?: number;
  bayesianEnabled: boolean;
  autoLockAbuseEnabled: boolean;
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
  clamav?: ClamavHealthStatusDto;
  todayMails: TodayMailStatsDto;
  mailSummary: {
    totalMails?: number;
    processedMails?: number;
    failedMails?: number;
    activeMailboxes: number;
  };
  spamSecurity?: {
    totalQuarantined: number;
    todayQuarantined: number;
    todaySpamBlocked: number;
    spamBlockRate: number;
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
  isSecure?: boolean;
  securityPassword?: string;
  isImportant?: boolean;
  replyToMailId?: string;
  forwardFromMailId?: string;
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
  spamScore?: number;
  spamReasons?: string[];
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

// ----------------------------------------------------
// Spam Rule Types
// ----------------------------------------------------

export const SpamRuleType = {
  WHITELIST: 'WHITELIST',
  BLACKLIST: 'BLACKLIST',
} as const;
export type SpamRuleType = (typeof SpamRuleType)[keyof typeof SpamRuleType];

export const SpamRuleTargetType = {
  EMAIL: 'EMAIL',
  DOMAIN: 'DOMAIN',
  IP: 'IP',
} as const;
export type SpamRuleTargetType =
  (typeof SpamRuleTargetType)[keyof typeof SpamRuleTargetType];

export interface SpamRuleDto {
  id: string;
  userId: string | null;
  type: SpamRuleType;
  targetType: SpamRuleTargetType;
  pattern: string;
  reason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSpamRuleDto {
  type: SpamRuleType;
  targetType: SpamRuleTargetType;
  pattern: string;
  reason?: string;
  isGlobal?: boolean;
}

export interface ReportSpamResponseDto {
  success: boolean;
  message: string;
  rule?: SpamRuleDto;
}

export interface QuarantineItemDto {
  id: string;
  sender: string;
  subject: string | null;
  spamScore: number;
  spamReasons: string[];
  spfResult: SpfResult;
  dkimResult: DkimResult;
  dmarcResult: DmarcResult;
  status: MailStatus;
  recipients: string[];
  createdAt: string;
}

export interface ReleaseMailResponseDto {
  success: boolean;
  message: string;
  releasedTo: string[];
}

// ----------------------------------------------------
// License Types
// ----------------------------------------------------

export interface LicensePayload {
  licenseId: string;
  product: string;
  productCode?: string;
  organizationName: string;
  maxUsers: number;
  registerExpiresAt?: string | null;
  expiresAt: string | null;
  isUnlimited: boolean;
  issuedAt: string;
  features?: string[];
}

export interface LicenseFileContent {
  version: string;
  product?: string;
  algorithm: string;
  payload: LicensePayload;
  signature: string;
}

export interface SystemLicenseInfo {
  isValid: boolean;
  licenseId?: string;
  product?: string;
  organizationName?: string;
  maxUsers?: number;
  currentUsers?: number;
  expiresAt?: string | null;
  isUnlimited?: boolean;
  isExpired?: boolean;
  daysRemaining?: number | null;
  issuedAt?: string;
  registeredAt?: string;
  fileIntegrityMatched?: boolean;
  message?: string;
}

export interface RegisterLicenseDto {
  licenseContent: string;
}

export const DEFAULT_BRAND_NAME = '가장자리 LEMail';

export function formatBrandName(
  license?: Pick<SystemLicenseInfo, 'isValid' | 'organizationName'> | null,
): string {
  const orgName = license?.organizationName?.trim();
  if (license?.isValid && orgName) {
    return `${orgName} LEMail`;
  }
  return DEFAULT_BRAND_NAME;
}

// ==========================================
// User Preferences & Signature Types
// ==========================================
export interface UserSignatureDto {
  useSignature: boolean;
  signatureHtml: string | null;
}

export interface UpdateUserSignatureDto {
  useSignature: boolean;
  signatureHtml?: string | null;
}

// ==========================================
// Mailbox Backup Types
// ==========================================
export const BackupStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
} as const;
export type BackupStatus = (typeof BackupStatus)[keyof typeof BackupStatus];

export interface MailBackupDto {
  id: string;
  userId: string;
  folderId: string | null;
  folderName: string;
  status: BackupStatus;
  totalCount: number;
  fileSizeBytes: number;
  downloadToken?: string;
  downloadUrl?: string;
  errorMessage?: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface RequestMailBackupDto {
  folderId?: string | null;
  folderIds?: string[];
}

export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
  confirmPassword?: string;
}

// ==========================================
// Contact & Address Book Types
// ==========================================
export interface ContactGroupDto {
  id: string;
  userId: string;
  name: string;
  color?: string;
  sortOrder: number;
  contactCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateContactGroupDto {
  name: string;
  color?: string;
  sortOrder?: number;
}

export interface UpdateContactGroupDto {
  name?: string;
  color?: string;
  sortOrder?: number;
}

export interface ContactDto {
  id: string;
  userId: string;
  groupId: string | null;
  groupName?: string | null;
  name: string;
  email: string | null;
  phone?: string | null;
  company?: string | null;
  department?: string | null;
  position?: string | null;
  companyPhone?: string | null;
  companyFax?: string | null;
  mobileCountryCode?: string | null;
  birthday?: string | null;
  postalCode?: string | null;
  address?: string | null;
  addressDetail?: string | null;
  websiteUrl?: string | null;
  memo?: string | null;
  isStarred: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateContactDto {
  name: string;
  email?: string | null;
  groupId?: string | null;
  phone?: string | null;
  company?: string | null;
  department?: string | null;
  position?: string | null;
  companyPhone?: string | null;
  companyFax?: string | null;
  mobileCountryCode?: string | null;
  birthday?: string | null;
  postalCode?: string | null;
  address?: string | null;
  addressDetail?: string | null;
  websiteUrl?: string | null;
  memo?: string | null;
  isStarred?: boolean;
}

export interface UpdateContactDto {
  name?: string;
  email?: string | null;
  groupId?: string | null;
  phone?: string | null;
  company?: string | null;
  department?: string | null;
  position?: string | null;
  companyPhone?: string | null;
  companyFax?: string | null;
  mobileCountryCode?: string | null;
  birthday?: string | null;
  postalCode?: string | null;
  address?: string | null;
  addressDetail?: string | null;
  websiteUrl?: string | null;
  memo?: string | null;
  isStarred?: boolean;
}

export type DuplicateContactAction = 'SKIP' | 'OVERWRITE' | 'KEEP_BOTH';

export interface ImportContactsResultDto {
  total: number;
  imported: number;
  skipped: number;
  errors: string[];
}

export interface ContactSearchResultDto {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  company?: string | null;
  department?: string | null;
  position?: string | null;
  source: 'CONTACT' | 'SYSTEM_USER';
}

// ==========================================
// Calendar & Event Types
// ==========================================
export type CalendarType = 'PERSONAL' | 'SHARED' | 'HOLIDAY';

export interface CalendarDto {
  id: string;
  userId: string;
  ownerName?: string | null;
  name: string;
  color: string;
  type: CalendarType;
  isDefault: boolean;
  isVisible: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCalendarDto {
  name: string;
  color?: string;
  type?: 'PERSONAL' | 'SHARED';
  isVisible?: boolean;
  sortOrder?: number;
}

export interface UpdateCalendarDto {
  name?: string;
  color?: string;
  type?: 'PERSONAL' | 'SHARED';
  isVisible?: boolean;
  sortOrder?: number;
}

export interface CalendarAttendeeDto {
  id?: string;
  email: string;
  name?: string | null;
  rsvpStatus: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'TENTATIVE';
}

export interface CreateCalendarAttendeeDto {
  email: string;
  name?: string | null;
}

export interface CalendarEventDto {
  id: string;
  calendarId: string;
  calendarName?: string;
  calendarColor?: string;
  userId: string;
  title: string;
  description?: string | null;
  location?: string | null;
  startAt: string;
  endAt: string;
  isAllDay: boolean;
  timezone: string;
  rrule?: string | null;
  recurrenceEndAt?: string | null;
  reminderMinutesBefore?: number | null;
  sourceMailId?: string | null;
  attendees?: CalendarAttendeeDto[];
  isRecurringInstance?: boolean;
  isReadOnly?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type HolidaySource = 'SEED' | 'KASI_API' | 'ICS_IMPORT' | 'ADMIN_MANUAL';

export interface SystemHolidayDto {
  id: string;
  holidayDate: string; // YYYY-MM-DD
  year: number;
  name: string;
  isSubstitute: boolean;
  source: HolidaySource;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateHolidayDto {
  holidayDate: string;
  name: string;
  isSubstitute?: boolean;
  isActive?: boolean;
}

export interface UpdateHolidayDto {
  holidayDate?: string;
  name?: string;
  isSubstitute?: boolean;
  isActive?: boolean;
}

export interface HolidaySyncSettingsDto {
  autoSyncEnabled: boolean;
  kasiApiKey: string;
  icsFeedUrl: string;
  lastSyncedAt: string | null;
  lastSyncStatus: string | null;
}

export interface HolidaySyncResultDto {
  syncedYears: number[];
  upserted: number;
  skippedManual: number;
  source: 'KASI_API' | 'ICS_IMPORT' | 'SEED';
  syncedAt: string;
}

export interface CreateCalendarEventDto {
  calendarId?: string;
  title: string;
  description?: string | null;
  location?: string | null;
  startAt: string;
  endAt: string;
  isAllDay?: boolean;
  timezone?: string;
  rrule?: string | null;
  recurrenceEndAt?: string | null;
  reminderMinutesBefore?: number | null;
  sourceMailId?: string | null;
  attendees?: CreateCalendarAttendeeDto[];
}

export interface UpdateCalendarEventDto {
  calendarId?: string;
  title?: string;
  description?: string | null;
  location?: string | null;
  startAt?: string;
  endAt?: string;
  isAllDay?: boolean;
  timezone?: string;
  rrule?: string | null;
  recurrenceEndAt?: string | null;
  reminderMinutesBefore?: number | null;
  attendees?: CreateCalendarAttendeeDto[];
}






