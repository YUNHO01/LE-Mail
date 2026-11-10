import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  SpamRule,
  MailMessage,
  MailFolder,
  UserMail,
  User,
  MailRecipient,
  Domain,
  BayesianToken,
} from '../database/entities';
import { SpamService } from './spam.service';
import { SpamScoreService } from './spam-score.service';
import { QuarantineService } from './quarantine.service';
import { AttachmentSecurityService } from './attachment-security.service';
import { OutboundRateLimitService } from './outbound-rate-limit.service';
import { DkimSignService } from './dkim-sign.service';
import { SpamAnalyticsService } from './spam-analytics.service';
import { BayesianSpamService } from './bayesian-spam.service';
import { AccountDefenseService } from './account-defense.service';
import { DmarcReportService } from './dmarc-report.service';
import { SpamConfigService } from './spam-config.service';
import { SpamController } from './spam.controller';
import { QuarantineController } from './quarantine.controller';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SpamRule,
      MailMessage,
      MailFolder,
      UserMail,
      User,
      MailRecipient,
      Domain,
      BayesianToken,
    ]),
    forwardRef(() => MailModule),
  ],
  controllers: [SpamController, QuarantineController],
  providers: [
    SpamService,
    SpamScoreService,
    QuarantineService,
    AttachmentSecurityService,
    OutboundRateLimitService,
    DkimSignService,
    SpamAnalyticsService,
    BayesianSpamService,
    AccountDefenseService,
    DmarcReportService,
    SpamConfigService,
  ],
  exports: [
    SpamService,
    SpamScoreService,
    QuarantineService,
    AttachmentSecurityService,
    OutboundRateLimitService,
    DkimSignService,
    SpamAnalyticsService,
    BayesianSpamService,
    AccountDefenseService,
    DmarcReportService,
    SpamConfigService,
  ],
})
export class SpamModule {}
