import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { MailboxService } from '../src/modules/mailbox/mailbox.service';
import { MailService } from '../src/modules/mail/mail.service';
import { MonitoringService } from '../src/modules/monitoring/monitoring.service';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

async function testRestApi() {
  console.log('=== [Option C] Testing REST API and Swagger Generation ===');

  const app = await NestFactory.create(AppModule, { logger: ['warn', 'error'] });
  app.setGlobalPrefix('api');

  // Swagger 생성 검증
  const config = new DocumentBuilder()
    .setTitle('LEMail Server REST API')
    .setDescription('LEMail REST API')
    .setVersion('1.0.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  const swaggerPath = resolve(process.cwd(), 'swagger.json');
  require('fs').writeFileSync(swaggerPath, JSON.stringify(document, null, 2));

  console.log('1. Generated swagger.json: exists =', existsSync(swaggerPath));
  const rawSwagger = JSON.parse(readFileSync(swaggerPath, 'utf-8'));
  console.log('2. Swagger document endpoints count:', Object.keys(rawSwagger.paths).length);
  console.log('   Sample endpoints:', Object.keys(rawSwagger.paths).slice(0, 5));

  const mailboxService = app.get(MailboxService);
  const mailService = app.get(MailService);
  const monitoringService = app.get(MonitoringService);

  // 3. Mailbox API 검증
  console.log('3. Testing MailboxService CRUD & Statistics...');
  const testEmail = `apitest_${Date.now()}@testcorp.com`;
  const createdBox = await mailboxService.create({
    email: testEmail,
    domain: 'testcorp.com',
    isActive: true,
  });
  console.log('   Created mailbox:', createdBox.id, createdBox.email);

  const stats = await mailboxService.getStatistics();
  console.log('   Mailbox statistics:', stats);

  const list = await mailboxService.findAll({ search: 'apitest', page: 1, limit: 10 });
  console.log('   Found mailboxes count:', list.total, 'Items in page:', list.items.length);

  // 4. Monitoring API 검증
  console.log('4. Testing MonitoringService Overview & Queue...');
  const overview = await monitoringService.getSystemOverview();
  console.log('   System overview:', {
    uptimeSeconds: overview.uptimeSeconds,
    memoryRssMb: overview.memory.rssMb,
    queue: overview.queue.counts,
    mailSummary: overview.mailSummary,
  });

  // 5. MailService 조회 검증
  console.log('5. Testing MailService List...');
  const mails = await mailService.findAll({ page: 1, limit: 5 });
  console.log('   Total mails in DB:', mails.total);

  // 6. 사서함 정리
  await mailboxService.delete(createdBox.id);
  console.log('6. Cleaned up test mailbox');

  console.log('=== [Option C] REST API & Swagger Test PASSED! ===');
  await app.close();
}

testRestApi().catch((err) => {
  console.error('REST API Test Failed:', err);
  process.exit(1);
});
