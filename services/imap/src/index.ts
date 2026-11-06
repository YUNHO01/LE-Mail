import { imapConfig } from './config/imap-config';
import { ImapServer } from './server/imap-server';

async function bootstrap() {
  console.log('====================================================');
  console.log('       LEMail IMAP4rev1 Microservice Starting       ');
  console.log('====================================================');

  const server = new ImapServer(imapConfig);

  const shutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}. Gracefully stopping IMAP server...`);
    await server.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  try {
    await server.start();
  } catch (err: any) {
    console.error(`Failed to start IMAP server: ${err.message}`, err);
    process.exit(1);
  }
}

bootstrap();
