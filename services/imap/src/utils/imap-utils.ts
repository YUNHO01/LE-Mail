export class ImapUtils {
  /**
   * Parse IMAP sequence set (e.g. "1:3", "1,3,5", "4:*", "1:*")
   * maxVal is the highest sequence number or UID in the folder.
   */
  static parseSequenceSet(setStr: string, maxVal: number): number[] {
    if (!setStr || maxVal <= 0) return [];
    const clean = setStr.replace(/[()]/g, '').trim();
    if (!clean) return [];

    const result = new Set<number>();
    const parts = clean.split(',');

    for (const part of parts) {
      if (part.includes(':')) {
        const [startStr, endStr] = part.split(':');
        const start = startStr === '*' ? maxVal : parseInt(startStr, 10);
        const end = endStr === '*' ? maxVal : parseInt(endStr, 10);

        if (!isNaN(start) && !isNaN(end)) {
          const low = Math.min(start, end);
          const high = Math.min(Math.max(start, end), maxVal);
          for (let i = Math.max(1, low); i <= high; i++) {
            result.add(i);
          }
        }
      } else {
        const num = part === '*' ? maxVal : parseInt(part, 10);
        if (!isNaN(num) && num > 0 && num <= maxVal) {
          result.add(num);
        }
      }
    }

    return Array.from(result).sort((a, b) => a - b);
  }

  /**
   * Format Date to IMAP INTERNALDATE (e.g. "06-Nov-2026 17:15:00 +0900")
   */
  static formatInternalDate(date: Date): string {
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    const day = String(date.getDate()).padStart(2, '0');
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    // Timezone offset (e.g. +0900)
    const tzOffset = -date.getTimezoneOffset();
    const tzSign = tzOffset >= 0 ? '+' : '-';
    const tzHours = String(Math.floor(Math.abs(tzOffset) / 60)).padStart(2, '0');
    const tzMinutes = String(Math.abs(tzOffset) % 60).padStart(2, '0');
    const tzStr = `${tzSign}${tzHours}${tzMinutes}`;

    return `${day}-${month}-${year} ${hours}:${minutes}:${seconds} ${tzStr}`;
  }

  /**
   * Parse email address into IMAP envelope mailbox and host
   * e.g. "John Doe <john@lineedge.com>" -> name: "John Doe", user: "john", host: "lineedge.com"
   */
  static parseAddress(addrStr: string): { name: string | null; user: string; host: string } {
    let name: string | null = null;
    let email = addrStr.trim();

    const match = addrStr.match(/^(?:"?([^"]*)"?\s)?(?:<?([^>]+)>?)$/);
    if (match) {
      name = match[1] ? match[1].trim() : null;
      email = match[2] ? match[2].trim() : email;
    }

    const atIndex = email.lastIndexOf('@');
    if (atIndex !== -1) {
      return {
        name,
        user: email.substring(0, atIndex),
        host: email.substring(atIndex + 1),
      };
    }

    return {
      name,
      user: email,
      host: 'localhost',
    };
  }

  /**
   * Build IMAP Address Structure: ((name nil user host))
   */
  static formatAddressList(addresses: string[]): string {
    if (!addresses || addresses.length === 0) return 'NIL';
    const formatted = addresses
      .map((a) => {
        const p = this.parseAddress(a);
        const namePart = p.name ? `"${p.name.replace(/"/g, '\\"')}"` : 'NIL';
        return `(${namePart} NIL "${p.user}" "${p.host}")`;
      })
      .join(' ');
    return `(${formatted})`;
  }

  /**
   * Build IMAP ENVELOPE string
   */
  static formatEnvelope(msg: {
    date: Date;
    subject: string | null;
    from: string;
    to: string[];
    cc: string[];
    bcc: string[];
    inReplyTo: string | null;
    messageId: string | null;
  }): string {
    const dateStr = `"${this.formatInternalDate(msg.date)}"`;
    const subjectStr = msg.subject ? `"${msg.subject.replace(/"/g, '\\"')}"` : 'NIL';
    const fromList = this.formatAddressList([msg.from]);
    const senderList = fromList;
    const replyToList = fromList;
    const toList = this.formatAddressList(msg.to);
    const ccList = this.formatAddressList(msg.cc);
    const bccList = this.formatAddressList(msg.bcc);
    const inReplyToStr = msg.inReplyTo ? `"${msg.inReplyTo}"` : 'NIL';
    const messageIdStr = msg.messageId ? `"${msg.messageId}"` : 'NIL';

    return `(${dateStr} ${subjectStr} ${fromList} ${senderList} ${replyToList} ${toList} ${ccList} ${bccList} ${inReplyToStr} ${messageIdStr})`;
  }

  /**
   * Format message flags
   */
  static formatFlags(flags: {
    isRead: boolean;
    isStarred: boolean;
    isDeleted: boolean;
    isAnswered: boolean;
    isDraft: boolean;
  }): string {
    const list: string[] = [];
    if (flags.isRead) list.push('\\Seen');
    if (flags.isStarred) list.push('\\Flagged');
    if (flags.isDeleted) list.push('\\Deleted');
    if (flags.isAnswered) list.push('\\Answered');
    if (flags.isDraft) list.push('\\Draft');
    return `(${list.join(' ')})`;
  }

  /**
   * Parse search criteria string preserving quoted phrases
   * e.g. 'SUBJECT "Test Mail 2" UNSEEN' -> ['SUBJECT', 'Test Mail 2', 'UNSEEN']
   */
  static parseSearchCriteria(rawStr: string): string[] {
    const tokens: string[] = [];
    const regex = /[^\s"]+|"([^"]*)"/g;
    let match;
    while ((match = regex.exec(rawStr)) !== null) {
      tokens.push(match[1] !== undefined ? match[1] : match[0]);
    }
    return tokens;
  }

  /**
   * Encode Unicode string to IMAP Modified UTF-7 (RFC 3501 Section 5.1.3)
   */
  static encodeModifiedUtf7(str: string): string {
    if (!str) return '';
    let res = '';
    let nonAscii = '';
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      if (c >= 0x20 && c <= 0x7e) {
        if (nonAscii) {
          const b = Buffer.from(nonAscii, 'utf16le');
          b.swap16();
          res += '&' + b.toString('base64').replace(/\//g, ',').replace(/=+$/, '') + '-';
          nonAscii = '';
        }
        if (c === 0x26) {
          res += '&-';
        } else {
          res += str[i];
        }
      } else {
        nonAscii += str[i];
      }
    }
    if (nonAscii) {
      const b = Buffer.from(nonAscii, 'utf16le');
      b.swap16();
      res += '&' + b.toString('base64').replace(/\//g, ',').replace(/=+$/, '') + '-';
    }
    return res;
  }

  /**
   * Decode IMAP Modified UTF-7 to Unicode string (RFC 3501 Section 5.1.3)
   */
  static decodeModifiedUtf7(str: string): string {
    if (!str) return '';
    return str.replace(/&([A-Za-z0-9+,]*)-/g, (_match, b64) => {
      if (b64 === '') return '&';
      let std = b64.replace(/,/g, '/');
      while (std.length % 4 !== 0) std += '=';
      const buf = Buffer.from(std, 'base64');
      buf.swap16();
      return buf.toString('utf16le');
    });
  }
}
