import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AiProvider } from '@lemail/shared-types';

export interface AiImageInput {
  mimeType: string;
  base64: string;
}

export interface AiGenerateRequest {
  provider: AiProvider;
  model: string;
  apiKey: string;
  customBaseUrl?: string | null;
  systemPrompt: string;
  userPrompt: string;
  images?: AiImageInput[];
  maxTokens?: number;
  temperature?: number;
}

@Injectable()
export class AiProviderAdapter {
  private readonly logger = new Logger(AiProviderAdapter.name);
  private readonly timeoutMs = 25000;

  async testConnection(req: {
    provider: AiProvider;
    model: string;
    apiKey: string;
    customBaseUrl?: string | null;
  }): Promise<void> {
    const signal = AbortSignal.timeout(10000);
    switch (req.provider) {
      case AiProvider.GEMINI: {
        const model = encodeURIComponent(req.model || 'gemini-3.8-flash');
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}?key=${encodeURIComponent(req.apiKey)}`;
        const res = await fetch(url, { method: 'GET', signal });
        await this.parseResponseJson(res, req.provider);
        return;
      }
      case AiProvider.OPENAI: {
        const model = encodeURIComponent(req.model || 'gpt-4o-mini');
        const res = await fetch(`https://api.openai.com/v1/models/${model}`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${req.apiKey}` },
          signal,
        });
        await this.parseResponseJson(res, req.provider);
        return;
      }
      case AiProvider.CUSTOM: {
        const base = (req.customBaseUrl || '').trim().replace(/\/+$/, '');
        if (!base || !/^https?:\/\//i.test(base)) {
          throw new BadRequestException(
            'Custom AI 제공자를 사용하려면 유효한 http(s) Base URL이 필요합니다.',
          );
        }
        const res = await fetch(`${base}/models`, {
          method: 'GET',
          headers: req.apiKey ? { Authorization: `Bearer ${req.apiKey}` } : undefined,
          signal,
        });
        if (res.status === 404) {
          await this.generateText({
            provider: req.provider,
            model: req.model,
            apiKey: req.apiKey,
            customBaseUrl: req.customBaseUrl,
            systemPrompt: 'Reply with OK.',
            userPrompt: 'Ping',
            maxTokens: 16,
            temperature: 0,
          });
          return;
        }
        await this.parseResponseJson(res, req.provider);
        return;
      }
      case AiProvider.ANTHROPIC:
      default:
        await this.generateText({
          provider: req.provider,
          model: req.model,
          apiKey: req.apiKey,
          customBaseUrl: req.customBaseUrl,
          systemPrompt: 'Reply with OK.',
          userPrompt: 'Ping',
          maxTokens: 16,
          temperature: 0,
        });
    }
  }

  async generateText(req: AiGenerateRequest): Promise<string> {
    switch (req.provider) {
      case AiProvider.OPENAI:
        return this.callOpenAiCompatible(
          'https://api.openai.com/v1',
          req,
        );
      case AiProvider.CUSTOM: {
        const base = (req.customBaseUrl || '').trim().replace(/\/+$/, '');
        if (!base || !/^https?:\/\//i.test(base)) {
          throw new BadRequestException(
            'Custom AI 제공자를 사용하려면 유효한 http(s) Base URL이 필요합니다.',
          );
        }
        return this.callOpenAiCompatible(base, req);
      }
      case AiProvider.GEMINI:
        return this.callGemini(req);
      case AiProvider.ANTHROPIC:
        return this.callAnthropic(req);
      default:
        throw new BadRequestException(`지원하지 않는 AI 제공자입니다: ${req.provider}`);
    }
  }

  private async callOpenAiCompatible(
    baseUrl: string,
    req: AiGenerateRequest,
  ): Promise<string> {
    const endpoint = baseUrl.endsWith('/chat/completions')
      ? baseUrl
      : `${baseUrl}/chat/completions`;

    const userContent: any =
      req.images && req.images.length > 0
        ? [
            { type: 'text', text: req.userPrompt },
            ...req.images.map((img) => ({
              type: 'image_url',
              image_url: {
                url: `data:${img.mimeType};base64,${img.base64}`,
              },
            })),
          ]
        : req.userPrompt;

    const response = await this.fetchWithTransientRetry(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${req.apiKey}`,
      },
      body: JSON.stringify({
        model: req.model,
        messages: [
          { role: 'system', content: req.systemPrompt },
          { role: 'user', content: userContent },
        ],
        temperature: req.temperature ?? 0.3,
        max_tokens: req.maxTokens ?? 1500,
      }),
    });

    const data: any = await this.parseResponseJson(response, req.provider);
    const content = data?.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string') {
      throw new BadRequestException('외부 AI 응답에서 텍스트를 추출하지 못했습니다.');
    }
    return content.trim();
  }

  private async callGemini(req: AiGenerateRequest): Promise<string> {
    const model = encodeURIComponent(req.model || 'gemini-3.8-flash');
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(req.apiKey)}`;

    const parts: any[] = [{ text: req.userPrompt }];
    if (req.images && req.images.length > 0) {
      for (const img of req.images) {
        parts.push({
          inlineData: {
            mimeType: img.mimeType,
            data: img.base64,
          },
        });
      }
    }

    const response = await this.fetchWithTransientRetry(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: req.systemPrompt }],
        },
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: req.temperature ?? 0.3,
          maxOutputTokens: req.maxTokens ?? 1500,
        },
      }),
    });

    const data: any = await this.parseResponseJson(response, req.provider);
    const responseParts = data?.candidates?.[0]?.content?.parts || [];
    const text = responseParts
      .filter((p: any) => !p?.thought)
      .map((p: any) => p?.text || '')
      .join('')
      .trim();
    if (!text) {
      const finishReason = data?.candidates?.[0]?.finishReason;
      throw new BadRequestException(
        `Gemini 응답에서 텍스트를 추출하지 못했습니다.${finishReason ? ` (finishReason: ${finishReason})` : ''}`,
      );
    }
    return text;
  }

  private async callAnthropic(req: AiGenerateRequest): Promise<string> {
    const endpoint = 'https://api.anthropic.com/v1/messages';

    const contentBlocks: any[] = [];
    if (req.images && req.images.length > 0) {
      for (const img of req.images) {
        contentBlocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: img.mimeType,
            data: img.base64,
          },
        });
      }
    }
    contentBlocks.push({ type: 'text', text: req.userPrompt });

    const response = await this.fetchWithTransientRetry(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': req.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: req.model || 'claude-3-5-sonnet-latest',
        system: req.systemPrompt,
        max_tokens: req.maxTokens ?? 1500,
        temperature: req.temperature ?? 0.3,
        messages: [{ role: 'user', content: contentBlocks }],
      }),
    });

    const data: any = await this.parseResponseJson(response, req.provider);
    const text = data?.content
      ?.filter((c: any) => c?.type === 'text')
      .map((c: any) => c?.text || '')
      .join('')
      .trim();
    if (!text) {
      throw new BadRequestException('Anthropic 응답에서 텍스트를 추출하지 못했습니다.');
    }
    return text;
  }

  private async fetchWithTransientRetry(
    endpoint: string,
    init: RequestInit,
  ): Promise<Response> {
    const res = await fetch(endpoint, {
      ...init,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (res.status === 429 || res.status === 503) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      return fetch(endpoint, {
        ...init,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    }
    return res;
  }

  private async parseResponseJson(
    response: Response,
    provider: AiProvider,
  ): Promise<any> {
    const raw = await response.text();
    let parsed: any = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }

    if (!response.ok) {
      const errMsg =
        parsed?.error?.message ||
        parsed?.message ||
        raw?.slice(0, 200) ||
        `HTTP ${response.status}`;
      this.logger.warn(`AI provider (${provider}) error: ${errMsg}`);
      throw new BadRequestException(`외부 AI 호출 실패 (${provider}): ${errMsg}`);
    }
    return parsed;
  }
}
