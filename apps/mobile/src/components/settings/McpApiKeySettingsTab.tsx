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
    desc: '메일, 폴더, 주소록, 캘린더 일정 조회',
  },
  {
    value: McpApiKeyScope.MCP_WRITE,
    label: '쓰기 (mcp:write)',
    desc: '읽음/별표/이동, 휴지통 이동, 임시저장, 일정·연락처 등록',
  },
];

export function McpApiKeySettingsTab() {
  const [apiKeys, setApiKeys] = useState<IntegrationApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<McpApiKeyScope[]>([
    McpApiKeyScope.MCP_READ,
  ]);
  const [submitting, setSubmitting] = useState(false);

  const [createdSecret, setCreatedSecret] = useState<CreateIntegrationApiKeyResponse | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

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

  const toggleScope = (scope: McpApiKeyScope) => {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || selectedScopes.length === 0) {
      setNotice({ type: 'error', text: '명칭과 최소 1개 이상의 스코프를 선택해 주세요.' });
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
      setNotice({ type: 'error', text: err?.message || 'API Key 발급에 실패했습니다.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (item: IntegrationApiKeyItem) => {
    try {
      await fetchApi(`/auth/api-keys/${item.id}/toggle`, { method: 'PATCH' });
      setNotice({
        type: 'success',
        text: `'${item.name}' 키가 ${item.isActive ? '비활성화' : '활성화'}되었습니다.`,
      });
      await loadKeys();
    } catch (err: any) {
      setNotice({ type: 'error', text: err?.message || '상태 변경에 실패했습니다.' });
    }
  };

  const handleDelete = async (item: IntegrationApiKeyItem) => {
    if (typeof window !== 'undefined') {
      const ok = window.confirm(`'${item.name}' (${item.keyPrefix}...) API Key를 폐기하시겠습니까?`);
      if (!ok) return;
    }
    try {
      await fetchApi(`/auth/api-keys/${item.id}`, { method: 'DELETE' });
      setNotice({ type: 'success', text: `'${item.name}' 키가 폐기되었습니다.` });
      await loadKeys();
    } catch (err: any) {
      setNotice({ type: 'error', text: err?.message || '삭제에 실패했습니다.' });
    }
  };

  const sseUrl = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/api/mcp/sse`;
  }, []);

  const copySecret = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    } catch {
      setNotice({ type: 'error', text: '클립보드 복사에 실패했습니다.' });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          외부 AI 클라이언트(MCP) 연동용 개인 API Key를 발급하고 관리합니다.
        </p>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={loadKeys}
            className="rounded-lg border border-slate-200 p-2 text-slate-600 active:bg-slate-100"
            aria-label="새로고침"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex items-center gap-1 rounded-lg bg-[#007AFF] px-3 py-2 text-xs font-semibold text-white active:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>발급</span>
          </button>
        </div>
      </div>

      {notice && (
        <div
          className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs ${
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

      {loading ? (
        <div className="py-8 text-center text-xs text-slate-400">불러오는 중...</div>
      ) : apiKeys.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center space-y-1.5">
          <Key className="mx-auto h-6 w-6 text-slate-300" />
          <p className="text-xs font-semibold text-slate-600">발급된 API Key가 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {apiKeys.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-900">{item.name}</span>
                    <code className="rounded bg-white px-1.5 py-0.5 text-[10px] font-mono text-slate-600 border border-slate-200">
                      {item.keyPrefix}...
                    </code>
                    {item.isActive ? (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600">
                        <CheckCircle2 className="h-3 w-3" /> 활성
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-slate-400">
                        <XCircle className="h-3 w-3" /> 비활성
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {item.scopes.map((sc) => (
                      <span
                        key={sc}
                        className="inline-flex items-center gap-0.5 rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700"
                      >
                        <Shield className="h-2.5 w-2.5" />
                        {sc}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400">
                    <span className="inline-flex items-center gap-0.5">
                      <Clock className="h-2.5 w-2.5" />
                      {item.expiresAt ? new Date(item.expiresAt).toLocaleDateString() : '무기한'}
                    </span>
                    <span>·</span>
                    <span>
                      {item.lastUsedAt
                        ? `최근 사용: ${new Date(item.lastUsedAt).toLocaleDateString()}`
                        : '미사용'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleToggleActive(item)}
                    className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600"
                    aria-label="상태 전환"
                  >
                    <Power className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(item)}
                    className="rounded-lg border border-rose-200 bg-rose-50 p-1.5 text-rose-600"
                    aria-label="폐기"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MCP 지원 기능 요약 */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-3 space-y-2 text-[11px]">
        <div className="flex items-center gap-1.5 font-bold text-slate-800">
          <Layers className="h-3.5 w-3.5 text-[#007AFF]" />
          <span>MCP 지원 기능 요약</span>
        </div>
        <div className="space-y-1.5 text-slate-600">
          <div className="rounded-lg bg-sky-50/60 p-2">
            <p className="font-semibold text-sky-900">읽기 (mcp:read)</p>
            <p>메일 목록·검색·본문 조회, 폴더/미읽음 현황, 주소록·조직도 검색, 캘린더 일정 조회</p>
          </div>
          <div className="rounded-lg bg-emerald-50/60 p-2">
            <p className="font-semibold text-emerald-900">쓰기 (mcp:write)</p>
            <p>읽음/별표/이동, 휴지통 이동(영구 삭제 불가), 스팸 신고, 임시저장/발송(정책 허용 시), 폴더·연락처·일정 등록</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3 space-y-1.5 text-[11px] text-slate-600">
        <div className="flex items-center gap-1.5 font-bold text-slate-800">
          <Terminal className="h-3.5 w-3.5" />
          <span>원격 MCP SSE 엔드포인트</span>
        </div>
        <code className="block break-all rounded bg-white px-2 py-1 border border-slate-200 font-mono text-[10px]">
          {sseUrl}
        </code>
        <p className="text-[10px] text-slate-500">
          요청 헤더에 <code>X-API-Key: 발급받은_키</code>를 포함해 연결하세요.
        </p>
      </div>

      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 p-3">
          <form
            onSubmit={handleCreate}
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl space-y-3"
          >
            <h4 className="text-sm font-bold text-slate-900">새 MCP API Key 발급</h4>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="키 명칭 (예: Claude Desktop)"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-[#007AFF] focus:outline-none"
              required
            />
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="설명 (선택)"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-[#007AFF] focus:outline-none"
            />
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-[#007AFF] focus:outline-none"
            />
            <div className="space-y-1.5">
              {SCOPE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-start gap-2 rounded-lg border border-slate-200 p-2 text-xs"
                >
                  <input
                    type="checkbox"
                    checked={selectedScopes.includes(opt.value)}
                    onChange={() => toggleScope(opt.value)}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="font-semibold text-slate-800">{opt.label}</div>
                    <div className="text-[11px] text-slate-500">{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-[#007AFF] px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                {submitting ? '발급 중...' : '발급'}
              </button>
            </div>
          </form>
        </div>
      )}

      {createdSecret && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl space-y-3">
            <div className="flex items-center gap-2 text-emerald-700">
              <Layers className="h-4 w-4" />
              <h4 className="text-sm font-bold">API Key 발급 완료</h4>
            </div>
            <p className="text-[11px] text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
              원본 키는 지금 1회만 표시됩니다. 닫기 전에 반드시 복사하세요.
            </p>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                readOnly
                value={createdSecret.rawKey}
                className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px] font-mono"
              />
              <button
                type="button"
                onClick={() => copySecret(createdSecret.rawKey)}
                className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
              >
                {copiedSecret ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedSecret ? '복사됨' : '복사'}</span>
              </button>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setCreatedSecret(null)}
                className="rounded-lg bg-[#007AFF] px-4 py-2 text-xs font-semibold text-white"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
