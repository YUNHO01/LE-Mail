import { Injectable } from '@nestjs/common';
import { CalendarEventDto } from '@lemail/shared-types';

export interface ParsedIcsEvent {
  title: string;
  description: string | null;
  location: string | null;
  startAt: Date;
  endAt: Date;
  isAllDay: boolean;
  rrule: string | null;
}

@Injectable()
export class CalendarIcsService {
  private escapeIcsText(text: string): string {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }

  private unescapeIcsText(text: string): string {
    return text
      .replace(/\\n/gi, '\n')
      .replace(/\\,/g, ',')
      .replace(/\\;/g, ';')
      .replace(/\\\\/g, '\\');
  }

  private formatIcsUtc(date: Date): string {
    return date
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}Z$/, 'Z');
  }

  private formatIcsDateOnly(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  }

  exportEventsToIcs(events: CalendarEventDto[], calendarName = 'LEMail Calendar'): string {
    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//LEMail//Calendar//KO',
      'CALSCALE:GREGORIAN',
      `X-WR-CALNAME:${this.escapeIcsText(calendarName)}`,
    ];

    const nowStamp = this.formatIcsUtc(new Date());

    for (const ev of events) {
      const start = new Date(ev.startAt);
      const end = new Date(ev.endAt);
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${ev.id}@lemail.local`);
      lines.push(`DTSTAMP:${nowStamp}`);
      if (ev.isAllDay) {
        const endPlusOne = new Date(end);
        endPlusOne.setDate(endPlusOne.getDate() + 1);
        lines.push(`DTSTART;VALUE=DATE:${this.formatIcsDateOnly(start)}`);
        lines.push(`DTEND;VALUE=DATE:${this.formatIcsDateOnly(endPlusOne)}`);
      } else {
        lines.push(`DTSTART:${this.formatIcsUtc(start)}`);
        lines.push(`DTEND:${this.formatIcsUtc(end)}`);
      }
      lines.push(`SUMMARY:${this.escapeIcsText(ev.title)}`);
      if (ev.location) {
        lines.push(`LOCATION:${this.escapeIcsText(ev.location)}`);
      }
      if (ev.description) {
        lines.push(`DESCRIPTION:${this.escapeIcsText(ev.description)}`);
      }
      if (ev.rrule) {
        lines.push(`RRULE:${ev.rrule}`);
      }
      lines.push('END:VEVENT');
    }

    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }

  private parseIcsDate(rawVal: string, isDateOnly: boolean): Date | null {
    const val = rawVal.trim();
    if (isDateOnly || /^\d{8}$/.test(val)) {
      const y = Number(val.slice(0, 4));
      const m = Number(val.slice(4, 6)) - 1;
      const d = Number(val.slice(6, 8));
      return new Date(y, m, d, 0, 0, 0, 0);
    }

    const match = val.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
    if (!match) {
      const fallback = new Date(val);
      return Number.isNaN(fallback.getTime()) ? null : fallback;
    }

    const [, y, mo, d, h, mi, s, isUtc] = match;
    if (isUtc) {
      return new Date(
        Date.UTC(
          Number(y),
          Number(mo) - 1,
          Number(d),
          Number(h),
          Number(mi),
          Number(s),
        ),
      );
    }
    return new Date(
      Number(y),
      Number(mo) - 1,
      Number(d),
      Number(h),
      Number(mi),
      Number(s),
    );
  }

  parseIcsToEvents(icsContent: string): ParsedIcsEvent[] {
    // RFC 5545 folded line 해제 (\r\n + space/tab)
    const unfolded = icsContent.replace(/\r?\n[ \t]/g, '');
    const rawLines = unfolded.split(/\r?\n/);

    const events: ParsedIcsEvent[] = [];
    let current: Record<string, { params: string; value: string }> | null = null;

    for (const line of rawLines) {
      const trimmed = line.trim();
      if (trimmed === 'BEGIN:VEVENT') {
        current = {};
        continue;
      }
      if (trimmed === 'END:VEVENT') {
        if (current && current['SUMMARY'] && current['DTSTART']) {
          const dtStartEntry = current['DTSTART'];
          const isAllDay =
            dtStartEntry.params.includes('VALUE=DATE') ||
            /^\d{8}$/.test(dtStartEntry.value.trim());

          const startAt = this.parseIcsDate(dtStartEntry.value, isAllDay);
          let endAt = current['DTEND']
            ? this.parseIcsDate(current['DTEND'].value, isAllDay)
            : null;

          if (startAt) {
            if (!endAt || endAt < startAt) {
              endAt = new Date(startAt);
              if (isAllDay) {
                endAt.setHours(23, 59, 59, 999);
              } else {
                endAt.setHours(endAt.getHours() + 1);
              }
            } else if (isAllDay) {
              // ICS VALUE=DATE DTEND는 exclusive이므로 하루 빼서 23:59:59로 맞춤
              endAt.setDate(endAt.getDate() - 1);
              if (endAt < startAt) endAt = new Date(startAt);
              endAt.setHours(23, 59, 59, 999);
            }

            events.push({
              title: this.unescapeIcsText(current['SUMMARY'].value).slice(0, 255),
              description: current['DESCRIPTION']
                ? this.unescapeIcsText(current['DESCRIPTION'].value)
                : null,
              location: current['LOCATION']
                ? this.unescapeIcsText(current['LOCATION'].value).slice(0, 255)
                : null,
              startAt,
              endAt,
              isAllDay,
              rrule: current['RRULE'] ? current['RRULE'].value.trim() : null,
            });
          }
        }
        current = null;
        continue;
      }

      if (current) {
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) continue;
        const propPart = line.slice(0, colonIdx);
        const value = line.slice(colonIdx + 1);
        const semiIdx = propPart.indexOf(';');
        const propName = (semiIdx === -1 ? propPart : propPart.slice(0, semiIdx)).toUpperCase();
        const params = semiIdx === -1 ? '' : propPart.slice(semiIdx + 1).toUpperCase();
        current[propName] = { params, value };
      }
    }

    return events;
  }
}
