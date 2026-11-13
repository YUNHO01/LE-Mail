import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not } from 'typeorm';
import {
  CalendarEvent,
  CalendarEventAttendee,
  User,
} from '../database/entities';
import { MailService } from '../mail/mail.service';

@Injectable()
export class CalendarReminderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CalendarReminderService.name);
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(
    @InjectRepository(CalendarEvent)
    private readonly eventRepo: Repository<CalendarEvent>,
    @InjectRepository(CalendarEventAttendee)
    private readonly attendeeRepo: Repository<CalendarEventAttendee>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly mailService: MailService,
  ) {}

  onModuleInit() {
    // 60초마다 다가오는 일정의 이메일 알림 여부 확인
    this.timer = setInterval(() => {
      this.processDueReminders().catch((err) => {
        this.logger.warn(`Calendar reminder check failed: ${err?.message}`);
      });
    }, 60_000);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async processDueReminders() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const now = new Date();
      const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const candidates = await this.eventRepo
        .createQueryBuilder('e')
        .where('e.reminder_minutes_before IS NOT NULL')
        .andWhere('e.reminder_sent_at IS NULL')
        .andWhere('e.start_at >= :windowStart', { windowStart })
        .getMany();

      for (const ev of candidates) {
        const minutes = ev.reminderMinutesBefore ?? 0;
        const triggerAt = new Date(ev.startAt.getTime() - minutes * 60_000);
        if (now < triggerAt) continue;

        const owner = await this.userRepo.findOne({ where: { id: ev.userId } });
        if (!owner || !owner.email) {
          ev.reminderSentAt = now;
          await this.eventRepo.save(ev);
          continue;
        }

        const attendees = await this.attendeeRepo.find({
          where: { eventId: ev.id },
        });
        const recipients = Array.from(
          new Set([owner.email, ...attendees.map((a) => a.email)].filter(Boolean)),
        );

        const startText = ev.startAt.toLocaleString('ko-KR', {
          timeZone: ev.timezone || 'Asia/Seoul',
        });
        const subject = `[일정 알림] ${ev.title} (${startText})`;
        const bodyText = [
          `일정: ${ev.title}`,
          `일시: ${startText}`,
          ev.location ? `장소: ${ev.location}` : null,
          ev.description ? `\n메모:\n${ev.description}` : null,
        ]
          .filter(Boolean)
          .join('\n');

        const bodyHtml = `
          <div style="font-family: sans-serif; line-height: 1.6; color: #1e293b;">
            <h3 style="margin: 0 0 12px; color: #0284c7;">일정 알림: ${this.escapeHtml(ev.title)}</h3>
            <p style="margin: 4px 0;"><strong>일시:</strong> ${this.escapeHtml(startText)}</p>
            ${ev.location ? `<p style="margin: 4px 0;"><strong>장소:</strong> ${this.escapeHtml(ev.location)}</p>` : ''}
            ${ev.description ? `<div style="margin-top: 12px; padding: 12px; background: #f8fafc; border-radius: 8px;">${this.escapeHtml(ev.description).replace(/\n/g, '<br/>')}</div>` : ''}
          </div>
        `;

        try {
          await this.mailService.sendMail(owner, {
            to: recipients,
            subject,
            bodyText,
            bodyHtml,
          });
          ev.reminderSentAt = new Date();
          await this.eventRepo.save(ev);
          this.logger.log(
            `Sent calendar reminder for event "${ev.title}" (${ev.id}) to ${recipients.join(', ')}`,
          );
        } catch (sendErr: any) {
          this.logger.warn(
            `Failed to send reminder email for event ${ev.id}: ${sendErr?.message}`,
          );
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
