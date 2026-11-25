'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Key,
  Layers,
  Plus,
  Power,
  RefreshCw,
  Search,
  Shield,
  Terminal,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  CreateIntegrationApiKeyRequest,
  CreateIntegrationApiKeyResponse,
  IntegrationApiKeyItem,
  McpApiKeyScope,
} from '@lemail/shared-types';
import { fetchApi } from '@/lib/api';

const SCOPE_OPTIONS: Array<{
  value: McpApiKeyScope;
  label: string;
  desc: string;
}> = [
  {
    value: McpApiKeyScope.MCP_READ,
    label: '읽기 (mcp:read)',
    desc: '메일 목록/검색/본문, 폴더, 주소록, 캘린더 일정 조회',
  },
  {
    value: McpApiKeyScope.MCP_WRITE,
    label: '쓰기 (mcp:write)',
    desc: '읽음/별표/폴더 이동, 휴지통 이동, 임시저장, 일정·연락처 등록',
  },
];

export function McpApiKeySettingsTab() {
  const [apiKeys, setApiKeys] = useState<IntegrationApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 발급 모달
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<McpApiKeyScope[]>([
    McpApiKeyScope.MCP_READ,
  ]);
  const [submitting, setSubmitting] = useState(false);

  // 1회 노출 비밀키 모달
  const [createdSecret, setCreatedSecret] = useState<CreateIntegrationApiKeyResponse | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedConfig, setCopiedConfig] = useState(false);

  const loadKeys = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchApi<IntegrationApiKeyItem[]>('/auth/api-keys');
      setApiKeys(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setNotice({
        type: 'error',
        text: err?.message || 'API Key 목록을 불러오지 못했습니다.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const filteredKeys = useMemo(() => {
    return apiKeys.filter((item) => {
      if (statusFilter === 'ACTIVE' && !item.isActive) return false;
      if (statusFilter === 'INACTIVE' && item.isActive) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = item.name.toLowerCase().includes(q);
        const matchPrefix = item.keyPrefix.toLowerCase().includes(q);
        const matchDesc = (item.description || '').toLowerCase().includes(q);
        if (!matchName && !matchPrefix && !matchDesc) return false;
      }
      return true;
    });
  }, [apiKeys, statusFilter, search]);

  const toggleScope = (scope: McpApiKeyScope) => {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setNotice({ type: 'error', text: 'API Key 명칭을 입력해 주세요.' });
      return;
    }
    if (selectedScopes.length === 0) {
      setNotice({ type: 'error', text: '최소 1개 이상의 권한 스코프를 선택해 주세요.' });
      return;
    }

    setSubmitting(true);
    setNotice(null);
    try {
      const payload: CreateIntegrationApiKeyRequest = {
        name: name.trim(),
        description: description.trim() || undefined,
        scopes: selectedScopes,
        expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : undefined,
      };
      const res = await fetchApi<CreateIntegrationApiKeyResponse>('/auth/api-keys', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setCreatedSecret(res);
      setCopiedSecret(false);
      setIsCreateOpen(false);
      setName('');
      setDescription('');
      setExpiresAt('');
      setSelectedScopes([McpApiKeyScope.MCP_READ]);
      await loadKeys();
    } catch (err: any) {
      setNotice({
        type: 'error',
        text: err?.message || 'API Key 발급에 실패했습니다.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (item: IntegrationApiKeyItem) => {
    try {
      await fetchApi<IntegrationApiKeyItem>(`/auth/api-keys/${item.id}/toggle`, {
        method: 'PATCH',
      });
      setNotice({
        type: 'success',
        text: `'${item.name}' 키가 ${item.isActive ? '비활성화' : '활성화'}되었습니다.`,
      });
      await loadKeys();
    } catch (err: any) {
      setNotice({
        type: 'error',
        text: err?.message || '상태 변경에 실패했습니다.',
      });
    }
  };

  const handleDelete = async (item: IntegrationApiKeyItem) => {
    if (typeof window !== 'undefined') {
      const ok = window.confirm(
        `'${item.name}' (${item.keyPrefix}...) API Key를 영구 폐기하시겠습니까?\n폐기 후 해당 키를 사용하는 MCP 클라이언트는 즉시 차단됩니다.`,
      );
      if (!ok) return;
    }

    try {
      await fetchApi(`/auth/api-keys/${item.id}`, { method: 'DELETE' });
      setNotice({ type: 'success', text: `'${item.name}' API Key가 폐기되었습니다.` });
      await loadKeys();
    } catch (err: any) {
      setNotice({
        type: 'error',
        text: err?.message || 'API Key 삭제에 실패했습니다.',
      });
    }
  };

  const apiOrigin =
    typeof window !== 'undefined' ? window.location.origin : 'https://mail.example.com';
  const sseEndpointUrl = `${apiOrigin}/api/mcp/sse`;

  const clientConfigSnippet = useMemo(() => {
    const keyPlaceholder = createdSecret?.rawKey || '<발급받은_API_KEY>';
    return JSON.stringify(
      {
        mcpServers: {
          lemail: {
            command: 'npx',
            args: ['-y', '@lemail/mcp-server'],
            env: {
              LEMAIL_API_URL: `${apiOrigin}/api`,
              LEMAIL_API_KEY: keyPlaceholder,
            },
          },
        },
      },
      null,
      2,
    );
  }, [apiOrigin, createdSecret]);

  const copyText = async (text: string, kind: 'secret' | 'config') => {
    try {
      await navigator.clipboard.writeText(text);
      if (kind === 'secret') setCopiedSecret(true);
      if (kind === 'config') setCopiedConfig(true);
      setTimeout(() => {
        if (kind === 'secret') setCopiedSecret(false);
        if (kind === 'config') setCopiedConfig(false);
      }, 2000);
    } catch {
      setNotice({ type: 'error', text: '클립보드 복사에 실패했습니다.' });
    }
  };

  return (
    <>
      <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
      {/* 상단 요약 및 발급 버튼 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
            <Key className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">MCP 연동 API Key 관리</h3>
            <p className="text-xs text-slate-500">
              Claude Desktop, Cursor 등 외부 AI 클라이언트에서 내 메일·주소록·캘린더에 안전하게 접근할 수 있는 개인용 API Key를 발급합니다.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={loadKeys}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>새로고침</span>
          </button>
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-sky-500"
          >
            <Plus className="h-4 w-4" />
            <span>새 API Key 발급</span>
          </button>
        </div>
      </div>

      {notice && (
        <div
          className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-xs font-medium ${
            notice.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-rose-200 bg-rose-50 text-rose-700'
          }`}
        >
          {notice.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span>{notice.text}</span>
        </div>
      )}

      {/* 검색 및 필터 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="키 명칭, 접두어(lem_...), 설명 검색"
            className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                statusFilter === st
                  ? 'bg-slate-900 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {st === 'ALL' ? '전체' : st === 'ACTIVE' ? '활성' : '비활성'}
            </button>
          ))}
        </div>
      </div>

      {/* API Key 목록 */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        {loading ? (
          <div className="py-12 text-center text-xs text-slate-400">API Key 목록을 불러오는 중...</div>
        ) : filteredKeys.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <Key className="mx-auto h-8 w-8 text-slate-300" />
            <p className="text-sm font-semibold text-slate-600">발급된 API Key가 없습니다.</p>
            <p className="text-xs text-slate-400">우측 상단의 &lsquo;새 API Key 발급&rsquo; 버튼을 눌러 연동 키를 생성해 주세요.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredKeys.map((item) => (
              <div
                key={item.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 hover:bg-slate-50/70 transition"
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">{item.name}</span>
                    <code className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-mono text-slate-600">
                      {item.keyPrefix}...
                    </code>
                    {item.isActive ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" /> 활성
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                        <XCircle className="h-3 w-3" /> 비활성
                      </span>
                    )}
                    {item.scopes.map((sc) => (
                      <span
                        key={sc}
                        className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700"
                      >
                        <Shield className="h-3 w-3" />
                        {sc}
                      </span>
                    ))}
                  </div>
                  {item.description && (
                    <p className="text-xs text-slate-500 truncate">{item.description}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-400">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      만료일: {item.expiresAt ? new Date(item.expiresAt).toLocaleDateString() : '무기한'}
                    </span>
                    <span>
                      마지막 사용:{' '}
                      {item.lastUsedAt
                        ? new Date(item.lastUsedAt).toLocaleString()
                        : '사용 이력 없음'}
                    </span>
                    <span>생성일: {new Date(item.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleToggleActive(item)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    title={item.isActive ? '비활성화' : '활성화'}
                  >
                    <Power className="h-3.5 w-3.5" />
                    <span>{item.isActive ? '비활성화' : '활성화'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(item)}
                    className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-100"
                    title="영구 폐기"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>폐기</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MCP 지원 기능 요약 */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-sky-600" />
          <h4 className="text-sm font-bold text-slate-900">MCP 지원 기능 요약</h4>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg border border-sky-100 bg-sky-50/50 p-3.5 space-y-1.5">
            <div className="font-bold text-sky-900">읽기 기능 (mcp:read)</div>
            <ul className="space-y-1 text-slate-600 list-disc list-inside">
              <li>메일함(폴더) 목록·미읽음 현황 및 사서함 용량 조회</li>
              <li>메일 목록 조회, 키워드 검색, 정제된 본문·첨부 메타데이터 확인</li>
              <li>개인 주소록 및 사내 임직원 조직도 검색</li>
              <li>내 캘린더·공유 캘린더 및 일정 조회</li>
            </ul>
          </div>
          <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3.5 space-y-1.5">
            <div className="font-bold text-emerald-900">쓰기 기능 (mcp:write)</div>
            <ul className="space-y-1 text-slate-600 list-disc list-inside">
              <li>메일 읽음/별표 전환, 폴더 이동, 휴지통 이동(영구 삭제 불가), 스팸 신고</li>
              <li>임시보관함 초안 저장(create_draft) 및 정책 허용 시 발송(send_mail)</li>
              <li>사용자 정의 메일함 생성 및 개인 주소록 연락처 등록</li>
              <li>캘린더 새 일정 등록 및 기존 일정 수정</li>
            </ul>
          </div>
        </div>
        <p className="text-[11px] text-slate-500">
          기본 제공 프롬프트: <code className="rounded bg-slate-100 px-1.5 py-0.5">daily_mail_briefing</code>(오늘의 메일·일정 브리핑),{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5">reply_mail_draft</code>(메일 회신 초안 작성)
        </p>
      </div>

      {/* MCP 클라이언트 연동 가이드 */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-slate-700" />
            <h4 className="text-sm font-bold text-slate-800">MCP 클라이언트 연동 안내</h4>
          </div>
          <button
            type="button"
            onClick={() => copyText(clientConfigSnippet, 'config')}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            {copiedConfig ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copiedConfig ? '복사됨' : '설정 JSON 복사'}</span>
          </button>
        </div>
        <div className="text-xs text-slate-600 space-y-1">
          <p>
            원격 SSE 엔드포인트: <code className="rounded bg-white px-1.5 py-0.5 border border-slate-200">{sseEndpointUrl}</code> (헤더 <code className="rounded bg-white px-1.5 py-0.5 border border-slate-200">X-API-Key</code>)
          </p>
          <p>Claude Desktop / Cursor 설정 예시 (<code className="font-mono">claude_desktop_config.json</code>):</p>
        </div>
        <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-[11px] font-mono text-slate-100">
          {clientConfigSnippet}
        </pre>
      </div>
      </div>

      {/* 발급 모달 */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleCreate}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-base font-bold text-slate-900">새 MCP API Key 발급</h4>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                닫기
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  명칭 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="예: 업무용 Claude Desktop"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-sky-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">설명 (선택)</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="용도 또는 사용 기기 메모"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">만료일 (선택, 미지정 시 무기한)</label>
                <input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  허용 권한 스코프 <span className="text-rose-500">*</span>
                </label>
                <div className="space-y-2">
                  {SCOPE_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className="flex items-start gap-2.5 rounded-lg border border-slate-200 p-2.5 cursor-pointer hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedScopes.includes(opt.value)}
                        onChange={() => toggleScope(opt.value)}
                        className="mt-0.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                      />
                      <div className="text-xs">
                        <div className="font-semibold text-slate-800">{opt.label}</div>
                        <div className="text-slate-500">{opt.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
              >
                {submitting ? '발급 중...' : '발급하기'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 1회 노출 비밀키 확인 모달 */}
      {createdSecret && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2 text-emerald-700">
              <Layers className="h-5 w-5" />
              <h4 className="text-base font-bold">API Key가 발급되었습니다</h4>
            </div>
            <p className="text-xs text-rose-600 font-medium bg-rose-50 border border-rose-200 rounded-lg p-3">
              보안을 위해 전체 API Key는 이 창을 닫으면 다시 확인할 수 없습니다. 반드시 안전한 곳에 복사해 보관하세요.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={createdSecret.rawKey}
                className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-800"
              />
              <button
                type="button"
                onClick={() => copyText(createdSecret.rawKey, 'secret')}
                className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                {copiedSecret ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedSecret ? '복사 완료' : '복사'}</span>
              </button>
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setCreatedSecret(null)}
                className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700"
              >
                확인 완료
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
