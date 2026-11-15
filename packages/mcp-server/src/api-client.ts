import { LemailMcpConfig } from './config.js';

export type McpScope = 'mcp:read' | 'mcp:write';

export class LemailApiClient {
  private token: string | null = null;
  private scopes: McpScope[] = ['mcp:read', 'mcp:write'];

  constructor(private readonly config: LemailMcpConfig) {
    if (config.apiToken) {
      this.token = config.apiToken;
    }
  }

  private async ensureAuth(): Promise<void> {
    if (this.token) return;

    if (this.config.apiKey) {
      const res = await fetch(`${this.config.apiUrl}/auth/exchange-api-key`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.config.apiKey,
        },
        body: JSON.stringify({ apiKey: this.config.apiKey }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`API Key 인증 실패 (${res.status}): ${text}`);
      }
      const data = (await res.json()) as { accessToken: string; scopes?: McpScope[] };
      this.token = data.accessToken;
      if (Array.isArray(data.scopes)) {
        this.scopes = data.scopes;
      }
      return;
    }

    if (this.config.email && this.config.password) {
      const res = await fetch(`${this.config.apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: this.config.email,
          password: this.config.password,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`로그인 인증 실패 (${res.status}): ${text}`);
      }
      const data = (await res.json()) as { accessToken: string };
      this.token = data.accessToken;
      return;
    }

    throw new Error(
      '인증 정보가 설정되지 않았습니다. LEMAIL_API_KEY, LEMAIL_API_TOKEN 또는 LEMAIL_EMAIL/LEMAIL_PASSWORD를 설정해 주세요.',
    );
  }

  async hasScope(scope: McpScope): Promise<boolean> {
    await this.ensureAuth();
    return this.scopes.includes(scope);
  }

  async request<T = any>(
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    await this.ensureAuth();
    const url = `${this.config.apiUrl}${path.startsWith('/') ? path : `/${path}`}`;

    const doFetch = async () =>
      fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });

    let res = await doFetch();
    if (res.status === 401) {
      this.token = null;
      await this.ensureAuth();
      res = await doFetch();
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`LEMail API 오류 (${res.status} ${method} ${path}): ${text}`);
    }

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return (await res.json()) as T;
    }
    return (await res.text()) as unknown as T;
  }
}
