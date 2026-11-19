declare module 'emailjs-imap-handler' {
  export interface ImapParsedCommand {
    tag: string;
    command: string;
    attributes?: any[];
  }

  export function parser(command: Buffer | Uint8Array): ImapParsedCommand;
  export function compiler(commandObject: any, isLogging?: boolean): string;
}
