import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import * as fs from 'fs';
import {
  AiImageAnalysisResultDto,
  AiMailDraftResultDto,
  AiMailSummaryResultDto,
  AiParsedCalendarEventDto,
  AiParsedContactDto,
  AiPolicyDto,
  AiProvider,
  AiResponseTone,
  TestAiConnectionResultDto,
  UserAiSettingsDto,
  UserRole,
} from '@lemail/shared-types';
import { UserAiSetting } from '../database/entities/user-ai-setting.entity';
import { UserMailAiSummary } from '../database/entities/user-mail-ai-summary.entity';
import { UserMail } from '../database/entities/user-mail.entity';
import { MailMessage } from '../database/entities/mail-message.entity';
import { User } from '../database/entities/user.entity';
import { MailAttachment } from '../database/entities/mail-attachment.entity';
import { SettingsService } from '../settings/settings.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import { AiImageInput, AiProviderAdapter } from './providers/ai-provider.adapter';
import {
  AiAnalyzeImageDto,
  AiCalendarParseDto,
  AiContactsParseDto,
  AiMailDraftDto,
  AiMailSummarizeDto,
  TestAiConnectionDto,
  UpdateUserAiSettingsDto,
} from './dto/ai.dto';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly inFlightSummaries = new Map<string, Promise<AiMailSummaryResultDto>>();

  constructor(
    @InjectRepository(UserAiSetting)
    private readonly userAiRepo: Repository<UserAiSetting>,
    @InjectRepository(UserMailAiSummary)
    private readonly summaryRepo: Repository<UserMailAiSummary>,
    @InjectRepository(UserMail)
    private readonly userMailRepo: Repository<UserMail>,
    @InjectRepository(MailMessage)
    private readonly messageRepo: Repository<MailMessage>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(MailAttachment)
    private readonly attachmentRepo: Repository<MailAttachment>,
    private readonly settingsService: SettingsService,
    private readonly cryptoService: CryptoService,
    private readonly adapter: AiProviderAdapter,
  ) {}

  async getPolicy(): Promise<AiPolicyDto> {
    const [personalExternalAiEnabled, imageAnalysisEnabled, allowedProviders, maxContextChars] =
      await Promise.all([
        this.settingsService.getBooleanSetting('AI_PERSONAL_EXTERNAL_ENABLED', false),
        this.settingsService.getBooleanSetting('AI_IMAGE_ANALYSIS_ENABLED', false),
        this.settingsService.getJsonSetting<AiProvider[]>('AI_ALLOWED_PROVIDERS', [
          AiProvider.OPENAI,
          AiProvider.GEMINI,
          AiProvider.ANTHROPIC,
          AiProvider.CUSTOM,
        ]),
        this.settingsService.getNumberSetting('AI_MAX_CONTEXT_CHARS', 15000),
      ]);

    return {
      personalExternalAiEnabled,
      imageAnalysisEnabled,
      allowedProviders: Array.isArray(allowedProviders)
        ? allowedProviders
        : [AiProvider.OPENAI, AiProvider.GEMINI, AiProvider.ANTHROPIC, AiProvider.CUSTOM],
      maxContextChars: maxContextChars > 0 ? maxContextChars : 15000,
    };
  }

  async getUserSettings(userId: string): Promise<UserAiSettingsDto> {
    const setting = await this.userAiRepo.findOne({ where: { userId } });
    if (!setting) {
      return {
        isEnabled: false,
        provider: AiProvider.OPENAI,
        model: 'gpt-4o-mini',
        hasApiKey: false,
        maskedApiKey: null,
        customBaseUrl: null,
        responseTone: AiResponseTone.PROFESSIONAL,
        preferredLanguage: 'ko',
        autoSummarizeOnRead: false,
      };
    }

    let maskedApiKey: string | null = null;
    if (setting.apiKeyEncrypted) {
      try {
        const plain = this.cryptoService.decrypt(setting.apiKeyEncrypted);
        maskedApiKey = this.cryptoService.maskSecret(plain);
      } catch {
        maskedApiKey = '****';
      }
    }

    return {
      isEnabled: setting.isEnabled,
      provider: setting.provider,
      model: setting.model,
      hasApiKey: Boolean(setting.apiKeyEncrypted),
      maskedApiKey,
      customBaseUrl: setting.customBaseUrl,
      responseTone: setting.responseTone,
      preferredLanguage: setting.preferredLanguage,
      autoSummarizeOnRead: Boolean(setting.autoSummarizeOnRead),
    };
  }

  async updateUserSettings(
    userId: string,
    dto: UpdateUserAiSettingsDto,
  ): Promise<UserAiSettingsDto> {
    const policy = await this.getPolicy();
    if (!policy.personalExternalAiEnabled) {
      throw new ForbiddenException(
        '관리자 정책에 의해 개인용 외부 AI 사용이 비활성화되어 있습니다.',
      );
    }

    if (!policy.allowedProviders.includes(dto.provider)) {
      throw new ForbiddenException(
        `관리자 정책상 허용되지 않은 AI 제공자입니다: ${dto.provider}`,
      );
    }

    let setting = await this.userAiRepo.findOne({ where: { userId } });
    if (!setting) {
      setting = this.userAiRepo.create({ userId });
    }

    setting.isEnabled = dto.isEnabled;
    setting.provider = dto.provider;
    setting.model = dto.model.trim();
    setting.customBaseUrl = dto.customBaseUrl?.trim() || null;
    if (dto.responseTone) {
      setting.responseTone = dto.responseTone;
    }
    if (dto.preferredLanguage) {
      setting.preferredLanguage = dto.preferredLanguage.trim();
    }
    if (dto.autoSummarizeOnRead !== undefined) {
      setting.autoSummarizeOnRead = Boolean(dto.autoSummarizeOnRead);
    }

    if (dto.clearApiKey) {
      setting.apiKeyEncrypted = null;
    } else if (dto.apiKey && dto.apiKey.trim() && !dto.apiKey.includes('****')) {
      setting.apiKeyEncrypted = this.cryptoService.encrypt(dto.apiKey.trim());
    }

    if (setting.isEnabled && !setting.apiKeyEncrypted && setting.provider !== AiProvider.CUSTOM) {
      throw new BadRequestException('AI 기능을 활성화하려면 API Key를 입력해야 합니다.');
    }

    await this.userAiRepo.save(setting);
    return this.getUserSettings(userId);
  }

  async testConnection(
    userId: string,
    dto: TestAiConnectionDto,
  ): Promise<TestAiConnectionResultDto> {
    const policy = await this.getPolicy();
    if (!policy.personalExternalAiEnabled) {
      throw new ForbiddenException(
        '관리자 정책에 의해 개인용 외부 AI 사용이 비활성화되어 있습니다.',
      );
    }

    let apiKey = dto.apiKey?.trim();
    if (!apiKey || apiKey.includes('****')) {
      const existing = await this.userAiRepo.findOne({ where: { userId } });
      if (existing?.apiKeyEncrypted) {
        apiKey = this.cryptoService.decrypt(existing.apiKeyEncrypted);
      }
    }

    if (!apiKey && dto.provider !== AiProvider.CUSTOM) {
      return {
        success: false,
        message: '테스트할 API Key가 입력되지 않았습니다.',
      };
    }

    const start = Date.now();
    try {
      await this.adapter.testConnection({
        provider: dto.provider,
        model: dto.model,
        apiKey: apiKey || '',
        customBaseUrl: dto.customBaseUrl,
      });

      return {
        success: true,
        message: `${dto.provider} (${dto.model}) 연결에 성공했습니다.`,
        latencyMs: Date.now() - start,
      };
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || 'AI 연결 테스트에 실패했습니다.',
        latencyMs: Date.now() - start,
      };
    }
  }

  async summarizeMail(
    userId: string,
    dto: AiMailSummarizeDto,
  ): Promise<AiMailSummaryResultDto> {
    const { policy, setting, apiKey } = await this.resolveActiveUserAi(userId);
    const strippedBody = this.stripQuotedMailContent(dto.bodyHtml, dto.bodyText);
    const body = this.sanitizeAndTruncate(strippedBody, policy.maxContextChars);

    if (!body) {
      throw new BadRequestException('요약할 메일 본문이 비어 있습니다.');
    }

    const lang = setting.preferredLanguage || 'ko';
    let messageId: string | null = null;
    if (dto.mailId) {
      messageId = await this.resolveAuthorizedMessageId(userId, dto.mailId);
    }

    const contentHash = crypto
      .createHash('sha256')
      .update(`${dto.subject || ''}\n${body}`)
      .digest('hex');

    if (messageId && !dto.forceRefresh) {
      const cached = await this.summaryRepo.findOne({
        where: { userId, messageId },
      });
      if (
        cached &&
        cached.preferredLanguage === lang &&
        cached.contentHash === contentHash
      ) {
        return {
          summary: cached.summary,
          actionItems: this.parseJsonStringArray(cached.actionItemsJson),
          keyDates: this.parseJsonStringArray(cached.keyDatesJson),
          cached: true,
          summarizedAt: cached.updatedAt.toISOString(),
        };
      }
    }

    const inFlightKey = messageId ? `${userId}:${messageId}:${lang}` : null;
    if (inFlightKey && !dto.forceRefresh) {
      const existingPromise = this.inFlightSummaries.get(inFlightKey);
      if (existingPromise) {
        return existingPromise;
      }
    }

    const executeSummary = async (): Promise<AiMailSummaryResultDto> => {
      const raw = await this.adapter.generateText({
        provider: setting.provider,
        model: setting.model,
        apiKey,
        customBaseUrl: setting.customBaseUrl,
        systemPrompt: `You are an enterprise email assistant. Summarize ONLY the latest/topmost email message content and ignore any remaining quoted replies, forwarded history, or boilerplate signatures. Respond strictly in JSON with keys: "summary" (string, concise 2-4 sentences in ${lang}), "actionItems" (string[], concrete tasks or requests), and "keyDates" (string[], mentioned deadlines or meeting dates). Do not include markdown fences.`,
        userPrompt: `Subject: ${dto.subject || '(제목 없음)'}\nFrom: ${dto.sender || '(알 수 없음)'}\n\nBody:\n${body}`,
        maxTokens: 1000,
      });

      const parsed = this.extractJson<Partial<AiMailSummaryResultDto>>(raw);
      const result: AiMailSummaryResultDto = {
        summary: parsed?.summary || raw,
        actionItems: Array.isArray(parsed?.actionItems) ? parsed.actionItems : [],
        keyDates: Array.isArray(parsed?.keyDates) ? parsed.keyDates : [],
        cached: false,
        summarizedAt: new Date().toISOString(),
      };

      if (messageId) {
        await this.upsertMailSummary({
          userId,
          messageId,
          preferredLanguage: lang,
          contentHash,
          provider: setting.provider,
          model: setting.model,
          result,
        });
      }

      return result;
    };

    if (!inFlightKey || dto.forceRefresh) {
      return executeSummary();
    }

    const promise = executeSummary().finally(() => {
      this.inFlightSummaries.delete(inFlightKey);
    });
    this.inFlightSummaries.set(inFlightKey, promise);
    return promise;
  }

  async draftMail(
    userId: string,
    dto: AiMailDraftDto,
  ): Promise<AiMailDraftResultDto> {
    const { policy, setting, apiKey } = await this.resolveActiveUserAi(userId);
    const tone = dto.tone || setting.responseTone || AiResponseTone.PROFESSIONAL;
    const lang = dto.targetLanguage || setting.preferredLanguage || 'ko';
    const original = this.sanitizeAndTruncate(
      dto.originalBody || '',
      policy.maxContextChars,
    );

    const modeInstructions: Record<AiMailDraftDto['mode'], string> = {
      compose: `Write a new email draft based on the user's instructions in language "${lang}" with a ${tone} tone.`,
      reply: `Write a reply email draft to the original email in language "${lang}" with a ${tone} tone.`,
      polish: `Improve and polish the user's email draft in language "${lang}" with a ${tone} tone while preserving its meaning.`,
      translate: `Translate the email content naturally into language "${lang}" with a ${tone} tone.`,
    };

    const raw = await this.adapter.generateText({
      provider: setting.provider,
      model: setting.model,
      apiKey,
      customBaseUrl: setting.customBaseUrl,
      systemPrompt: `You are an enterprise email writing assistant. ${modeInstructions[dto.mode]} Respond strictly in JSON with keys: "subject" (optional string, suggested subject if applicable) and "body" (string, plain text email body ready to insert). Do not wrap in markdown code fences.`,
      userPrompt: `Subject: ${dto.subject || ''}\nInstruction: ${dto.prompt || ''}\n\nContent:\n${original}`,
      maxTokens: 1500,
    });

    const parsed = this.extractJson<Partial<AiMailDraftResultDto>>(raw);
    return {
      subject: parsed?.subject,
      body: parsed?.body || raw,
    };
  }

  async parseContact(
    userId: string,
    dto: AiContactsParseDto,
  ): Promise<AiParsedContactDto> {
    const { policy, setting, apiKey } = await this.resolveActiveUserAi(userId);
    const text = this.sanitizeAndTruncate(dto.rawText, policy.maxContextChars);
    if (!text) {
      throw new BadRequestException('추출할 서명 또는 명함 텍스트가 비어 있습니다.');
    }

    const raw = await this.adapter.generateText({
      provider: setting.provider,
      model: setting.model,
      apiKey,
      customBaseUrl: setting.customBaseUrl,
      systemPrompt: `Extract contact information from the email signature or business card text. If multiple signatures appear in a thread, prioritize the sender matching the provided sender name/email or the topmost recent signature. Respond strictly in JSON with keys: name, email, company, department, jobTitle, phone, mobile, address, websiteUrl, memo (use null when unknown). Do not wrap in markdown fences.`,
      userPrompt: `Sender Hint: ${dto.senderName || ''} <${dto.senderEmail || ''}>\n\nText:\n${text}`,
      maxTokens: 800,
      temperature: 0.1,
    });

    const parsed = this.extractJson<AiParsedContactDto>(raw);
    return parsed || { name: dto.senderName || null, email: dto.senderEmail || null };
  }

  async parseCalendarEvent(
    userId: string,
    dto: AiCalendarParseDto,
  ): Promise<AiParsedCalendarEventDto> {
    const { policy, setting, apiKey } = await this.resolveActiveUserAi(userId);
    const text = this.sanitizeAndTruncate(dto.rawText, policy.maxContextChars);
    if (!text) {
      throw new BadRequestException('일정을 추출할 텍스트가 비어 있습니다.');
    }

    const refDate = dto.referenceDate || new Date().toISOString();
    const tz = dto.timezone || 'Asia/Seoul';

    const raw = await this.adapter.generateText({
      provider: setting.provider,
      model: setting.model,
      apiKey,
      customBaseUrl: setting.customBaseUrl,
      systemPrompt: `Extract a single calendar event from the text. Reference datetime is "${refDate}" in timezone "${tz}". Respond strictly in JSON with keys: title (string), description (string|null), location (string|null), startAt (ISO 8601 string with offset or local YYYY-MM-DDTHH:mm:ss), endAt (ISO 8601 string, default +1 hour after startAt if duration omitted), isAllDay (boolean). Do not wrap in markdown fences.`,
      userPrompt: text,
      maxTokens: 600,
      temperature: 0.1,
    });

    const parsed = this.extractJson<AiParsedCalendarEventDto>(raw);
    if (!parsed?.title || !parsed?.startAt) {
      throw new BadRequestException('텍스트에서 유효한 일정 정보를 추출하지 못했습니다.');
    }
    return parsed;
  }

  async analyzeImage(
    userId: string,
    dto: AiAnalyzeImageDto,
  ): Promise<AiImageAnalysisResultDto> {
    const { policy, setting, apiKey } = await this.resolveActiveUserAi(userId);
    if (!policy.imageAnalysisEnabled) {
      throw new ForbiddenException(
        '관리자 정책에 의해 본문 이미지 AI 해석 기능이 비활성화되어 있습니다.',
      );
    }

    const image = await this.resolveSafeImageInput(userId, dto);
    const lang = setting.preferredLanguage || 'ko';

    const contactHint = dto.extractContact
      ? ` Also extract any business card / signature contact fields into "detectedContact" ({ name, email, company, department, jobTitle, phone, mobile, address, websiteUrl, memo } or null).`
      : ` Set "detectedContact" to null.`;

    const raw = await this.adapter.generateText({
      provider: setting.provider,
      model: setting.model,
      apiKey,
      customBaseUrl: setting.customBaseUrl,
      systemPrompt: `Analyze the image and respond in language "${lang}".${contactHint} Respond strictly in JSON with keys: "description" (string, concise visual summary), "extractedText" (string|null, OCR text visible in the image), and "detectedContact" (object|null). Do not wrap in markdown fences.`,
      userPrompt: dto.prompt?.trim() || '이 이미지의 내용을 요약하고 포함된 텍스트를 추출해 주세요.',
      images: [image],
      maxTokens: 1200,
      temperature: 0.2,
    });

    const parsed = this.extractJson<Partial<AiImageAnalysisResultDto>>(raw);
    return {
      description: parsed?.description || raw,
      extractedText: parsed?.extractedText ?? null,
      detectedContact: parsed?.detectedContact ?? null,
    };
  }

  private async resolveActiveUserAi(userId: string) {
    const policy = await this.getPolicy();
    if (!policy.personalExternalAiEnabled) {
      throw new ForbiddenException(
        '관리자 정책에 의해 개인용 외부 AI 사용이 비활성화되어 있습니다.',
      );
    }

    const setting = await this.userAiRepo.findOne({ where: { userId } });
    if (!setting || !setting.isEnabled) {
      throw new BadRequestException(
        '사용자 환경설정에서 개인 AI 어시스턴트를 먼저 설정 및 활성화해 주세요.',
      );
    }

    if (!policy.allowedProviders.includes(setting.provider)) {
      throw new ForbiddenException(
        `관리자 정책상 현재 선택된 AI 제공자(${setting.provider})는 허용되지 않습니다.`,
      );
    }

    let apiKey = '';
    if (setting.apiKeyEncrypted) {
      apiKey = this.cryptoService.decrypt(setting.apiKeyEncrypted);
    }
    if (!apiKey && setting.provider !== AiProvider.CUSTOM) {
      throw new BadRequestException('저장된 AI API Key가 없습니다. 설정을 확인해 주세요.');
    }

    return { policy, setting, apiKey };
  }

  private async resolveSafeImageInput(
    userId: string,
    dto: AiAnalyzeImageDto,
  ): Promise<AiImageInput> {
    if (dto.imageDataUrl) {
      const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(
        dto.imageDataUrl.trim(),
      );
      if (!match) {
        throw new BadRequestException(
          '외부 URL 이미지는 보안상 지원하지 않으며, data:image/...;base64 형식만 허용됩니다.',
        );
      }
      const approxBytes = Math.floor((match[2].length * 3) / 4);
      if (approxBytes > MAX_IMAGE_BYTES) {
        throw new BadRequestException('이미지 크기는 최대 5MB까지만 해석할 수 있습니다.');
      }
      return { mimeType: match[1], base64: match[2] };
    }

    if (dto.mailId && dto.attachmentId) {
      const userMail = await this.userMailRepo.findOne({
        where: { id: dto.mailId, userId },
      });
      if (!userMail) {
        throw new NotFoundException('해당 메일에 접근 권한이 없습니다.');
      }
      const attachment = await this.attachmentRepo.findOne({
        where: { id: dto.attachmentId, messageId: userMail.messageId },
      });
      if (!attachment) {
        throw new NotFoundException('해당 첨부 이미지를 찾을 수 없습니다.');
      }
      if (!attachment.contentType.startsWith('image/')) {
        throw new BadRequestException('이미지 파일만 AI로 해석할 수 있습니다.');
      }
      if (!fs.existsSync(attachment.storagePath)) {
        throw new NotFoundException('스토리지에서 이미지 파일을 찾을 수 없습니다.');
      }
      const stat = fs.statSync(attachment.storagePath);
      if (stat.size > MAX_IMAGE_BYTES) {
        throw new BadRequestException('이미지 크기는 최대 5MB까지만 해석할 수 있습니다.');
      }
      const buffer = fs.readFileSync(attachment.storagePath);
      return {
        mimeType: attachment.contentType,
        base64: buffer.toString('base64'),
      };
    }

    throw new BadRequestException(
      '해석할 이미지(imageDataUrl 또는 mailId + attachmentId)를 지정해 주세요.',
    );
  }

  private async resolveAuthorizedMessageId(
    userId: string,
    mailId: string,
  ): Promise<string> {
    const userMail = await this.userMailRepo.findOne({
      where: [
        { messageId: mailId, userId },
        { id: mailId, userId },
      ],
    });
    if (userMail) {
      return userMail.messageId;
    }

    const message = await this.messageRepo.findOne({
      where: { id: mailId },
      relations: { recipients: true },
    });
    if (!message) {
      throw new NotFoundException('해당 메일을 찾을 수 없습니다.');
    }

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new ForbiddenException('유효하지 않은 사용자입니다.');
    }
    if (user.role === UserRole.SYSTEM_ADMIN) {
      return message.id;
    }

    const userEmail = user.email?.toLowerCase();
    const isSenderOrRecipient =
      userEmail &&
      (message.sender?.toLowerCase().includes(userEmail) ||
        message.recipients?.some((r) => r.address?.toLowerCase() === userEmail));

    if (isSenderOrRecipient) {
      return message.id;
    }

    throw new ForbiddenException('해당 메일에 접근 권한이 없습니다.');
  }

  private stripQuotedMailContent(bodyHtml?: string, bodyText?: string): string {
    const rawFallback = (bodyText || bodyHtml || '').trim();
    if (!rawFallback) return '';

    let text = '';
    if (bodyHtml && bodyHtml.trim()) {
      let cleanedHtml = bodyHtml
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ');

      // Cut at explicit reply/forward separator markers in HTML
      const htmlMarkerMatch =
        /(-{5}\s*Original Message\s*-{5}|-{10}\s*Forwarded message\s*-{9,10}|-{3,}\s*원본\s*메일\s*-{3,})/i.exec(
          cleanedHtml,
        );
      if (htmlMarkerMatch && htmlMarkerMatch.index > 0) {
        cleanedHtml = cleanedHtml.slice(0, htmlMarkerMatch.index);
      }

      // Remove common quoted HTML containers (Gmail, Outlook, Yahoo, standard blockquote)
      cleanedHtml = cleanedHtml
        .replace(/<div[^>]*\bid=["']divRplyFwdMsg["'][^>]*>[\s\S]*$/i, '')
        .replace(/<div[^>]*\bclass=["'][^"']*\b(?:gmail_quote|gmail_quote_container|yahoo_quoted)\b[^"']*["'][^>]*>[\s\S]*$/i, '');

      // Remove innermost <blockquote>...</blockquote> iteratively to handle nested quotes safely
      let prevHtml = '';
      while (prevHtml !== cleanedHtml) {
        prevHtml = cleanedHtml;
        cleanedHtml = cleanedHtml.replace(
          /<blockquote\b[^>]*>(?:(?!<blockquote\b)[\s\S])*?<\/blockquote>/gi,
          ' ',
        );
      }

      text = cleanedHtml
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|blockquote|h[1-6]|tr)>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ');
    } else if (bodyText) {
      text = bodyText;
    }

    const strippedText = this.stripQuotedTextLines(text);
    return strippedText || rawFallback;
  }

  private stripQuotedTextLines(input: string): string {
    if (!input) return '';
    let text = input.replace(/\r\n/g, '\n');

    const cutPatterns: RegExp[] = [
      /(?:^|\n)\s*-{5}\s*Original Message\s*-{5}/i,
      /(?:^|\n)\s*-{10}\s*Forwarded message\s*-{9,10}/i,
      /(?:^|\n)\s*-{3,}\s*원본\s*메일\s*-{3,}/i,
      /(?:^|\n)\s*On\s+[^\n]{5,120}\s+wrote:\s*(?:\n|$)/i,
      /(?:^|\n)\s*[^\n]{2,80}(?:님이\s*작성|작성)\s*:\s*(?:\n|$)/i,
      /(?:^|\n)\s*From:\s*[^\n]+\n\s*(?:Sent|Date):\s*[^\n]+\n\s*To:\s*[^\n]+/i,
      /(?:^|\n)\s*보낸\s*사람:\s*[^\n]+\n\s*(?:보낸\s*날짜|날짜):\s*[^\n]+/i,
    ];

    for (const pattern of cutPatterns) {
      const match = pattern.exec(text);
      if (match && match.index > 0) {
        text = text.slice(0, match.index);
      }
    }

    const lines = text.split('\n').filter((line) => !/^\s*>/.test(line));
    return lines.join('\n').trim();
  }

  private parseJsonStringArray(raw: string | null): string[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [];
    } catch {
      return [];
    }
  }

  private async upsertMailSummary(params: {
    userId: string;
    messageId: string;
    preferredLanguage: string;
    contentHash: string;
    provider: string;
    model: string;
    result: AiMailSummaryResultDto;
  }): Promise<void> {
    try {
      const existing = await this.summaryRepo.findOne({
        where: { userId: params.userId, messageId: params.messageId },
      });

      const entity = existing || this.summaryRepo.create({
        userId: params.userId,
        messageId: params.messageId,
      });

      entity.preferredLanguage = params.preferredLanguage;
      entity.contentHash = params.contentHash;
      entity.provider = params.provider;
      entity.model = params.model;
      entity.summary = params.result.summary;
      entity.actionItemsJson = JSON.stringify(params.result.actionItems || []);
      entity.keyDatesJson = JSON.stringify(params.result.keyDates || []);

      await this.summaryRepo.save(entity);
    } catch (err: any) {
      this.logger.warn(`Failed to cache AI mail summary: ${err?.message}`);
    }
  }

  private sanitizeAndTruncate(input: string, maxChars: number): string {
    if (!input) return '';
    const stripped = input
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (stripped.length <= maxChars) return stripped;
    return `${stripped.slice(0, maxChars)}\n... (이하 길이 제한으로 생략됨)`;
  }

  private extractJson<T>(raw: string): T | null {
    if (!raw) return null;
    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    try {
      return JSON.parse(cleaned) as T;
    } catch {
      const match = /\{[\s\S]*\}/.exec(cleaned);
      if (match) {
        try {
          return JSON.parse(match[0]) as T;
        } catch {
          return null;
        }
      }
      return null;
    }
  }
}
