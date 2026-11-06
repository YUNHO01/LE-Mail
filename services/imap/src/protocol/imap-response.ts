export class ImapResponse {
  static tagged(
    tag: string,
    status: 'OK' | 'NO' | 'BAD',
    message: string,
    code?: string,
  ): string {
    const codePart = code ? `[${code}] ` : '';
    return `${tag} ${status} ${codePart}${message}\r\n`;
  }

  static untagged(
    status: 'OK' | 'NO' | 'BAD' | 'PREAUTH' | 'BYE',
    message: string,
    code?: string,
  ): string {
    const codePart = code ? `[${code}] ` : '';
    return `* ${status} ${codePart}${message}\r\n`;
  }

  static capability(capabilities: string[]): string {
    return `* CAPABILITY ${capabilities.join(' ')}\r\n`;
  }

  static data(content: string): string {
    return `* ${content}\r\n`;
  }

  static continuation(message = ''): string {
    return `+ ${message}\r\n`;
  }
}
