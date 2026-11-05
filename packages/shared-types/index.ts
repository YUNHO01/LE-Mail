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
