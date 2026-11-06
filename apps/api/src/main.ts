import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from '@nestjs/common';
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { ConfigService } from '@nestjs/config';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // 요청 본문(JSON 및 URL-encoded) 크기 제한 상향 (본문 서식 및 첨부파일 지원, 기본 100kb -> 50mb)
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));

  // CORS 활성화 (Next.js 프론트엔드 연동)
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // 전역 API Prefix
  app.setGlobalPrefix('api');

  // Swagger 문서 구성
  const config = new DocumentBuilder()
    .setTitle('LEMail Server REST API')
    .setDescription('LEMail SMTP 메일 서버 관리자 및 웹메일 사용자용 REST API 명세서')
    .setVersion('1.0.0')
    .addTag('Mailboxes', '사서함 및 도메인 관리')
    .addTag('Mails', '메일 목록/상세 조회 및 첨부파일/EML 다운로드')
    .addTag('Monitoring', 'BullMQ 큐 현황 및 시스템 자원 모니터링')
    .addTag('Auth', '사용자 인증 및 로그인')
    .addTag('Users', '사용자 계정 관리')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // ams 프론트엔드 (openapi-typescript) 연동을 위해 swagger.json 파일 자동 출력
  try {
    const swaggerJsonPath = resolve(process.cwd(), 'swagger.json');
    writeFileSync(swaggerJsonPath, JSON.stringify(document, null, 2));
    logger.log(`Exported swagger.json specification to: ${swaggerJsonPath}`);
  } catch (err) {
    logger.warn(`Failed to export swagger.json: ${err.message}`);
  }

  const port = configService.get<number>('port') || 9200;
  await app.listen(port);
  logger.log(`LEMail HTTP & REST API Server running on port ${port} (Swagger: http://localhost:${port}/api/docs)`);
}
bootstrap();
