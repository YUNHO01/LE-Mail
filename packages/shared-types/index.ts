export enum UserRole {
  SYSTEM_ADMIN = 'SYSTEM_ADMIN',
  USER = 'USER',
}

export enum Direction {
  INBOUND = 'INBOUND',
  OUTBOUND = 'OUTBOUND',
}

export enum MailStatus {
  QUEUED = 'QUEUED',
  PROCESSED = 'PROCESSED',
  FAILED = 'FAILED',
}

export enum SpfResult {
  PASS = 'PASS',
  FAIL = 'FAIL',
  SOFTFAIL = 'SOFTFAIL',
  NEUTRAL = 'NEUTRAL',
  NONE = 'NONE',
}

export enum DkimResult {
  PASS = 'PASS',
  FAIL = 'FAIL',
  NONE = 'NONE',
}

export enum DmarcResult {
  PASS = 'PASS',
  FAIL = 'FAIL',
  NONE = 'NONE',
}

export enum RecipientType {
  TO = 'TO',
  CC = 'CC',
  BCC = 'BCC',
}

export interface UserDto {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
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
  createdAt: string;
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
  mailSummary: {
    totalMails: number;
    processedMails: number;
    failedMails: number;
    activeMailboxes: number;
  };
}
