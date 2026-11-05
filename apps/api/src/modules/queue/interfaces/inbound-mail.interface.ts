export interface InboundMailJobData {
  id: string;
  rawFilePath: string;
  from: string;
  to: string[];
  clientIp?: string;
}

export const INBOUND_MAIL_QUEUE_NAME = 'mail-inbound';
export const PROCESS_MAIL_JOB_NAME = 'process-mail';
