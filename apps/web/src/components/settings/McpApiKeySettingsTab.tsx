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
      setCreateError('API Key 명칭을 입력해 주세요.');
      return;
    }
    if (selectedScopes.length === 0) {
      setCreateError('최소 1개 이상의 권한 스코프를 선택해 주세요.');
      return;
    }

    setSubmitting(true);
    setCreateError(null);
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
      setCreateError(err?.message || 'API Key 발급에 실패했습니다.');
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
    setConfirmDeleteId(null);
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
            args: ['-y', '@lineedge/lemail-mcp-server'],
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

  const [showGuide, setShowGuide] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!isCreateOpen && !createdSecret) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isCreateOpen) {
          setIsCreateOpen(false);
          setCreateError(null);
        } else if (createdSecret && copiedSecret) {
          setCreatedSecret(null);
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isCreateOpen, createdSecret, copiedSecret]);

  return (
    <>
      <div className="space-y-6 rounded-2xl border border-black/[0.08] bg-white p-6 shadow-xs">
        {/* 상단 요약 및 발급 버튼 */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-black/[0.06] pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0071e3]/10 text-[#0071e3]">
              <Key className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#1d1d1f]">MCP 연동 API Key 관리</h3>
              <p className="text-xs text-[#6e6e73]">
                Claude Desktop, Cursor 등 외부 AI 클라이언트에서 내 메일·주소록·캘린더에 안전하게 접근할 수 있는 개인용 API Key를 발급합니다.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={loadKeys}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-black/[0.1] bg-white px-3.5 text-xs font-semibold text-[#1d1d1f] hover:bg-black/[0.03] transition"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-[#0071e3]' : ''}`} />
              <span>새로고침</span>
            </button>
            <button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#0071e3] px-4 text-xs font-semibold text-white shadow-xs hover:bg-[#0062c4] transition"
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
                ? 'border-[#34c759]/30 bg-[#34c759]/10 text-[#248a3d]'
                : 'border-[#ff3b30]/25 bg-[#ff3b30]/[0.06] text-[#d70015]'
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
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#86868b]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="키 명칭, 접두어(lem_...), 설명 검색"
              className="h-[38px] w-full rounded-lg border border-black/[0.1] bg-white pl-9 pr-3 text-xs text-[#1d1d1f] placeholder:text-[#86868b] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/15 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-1.5">
            {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`h-8 rounded-lg px-3 text-xs font-semibold transition ${
                  statusFilter === st
                    ? 'bg-[#1d1d1f] text-white'
                    : 'bg-white border border-black/[0.1] text-[#6e6e73] hover:bg-black/[0.03]'
                }`}
              >
                {st === 'ALL' ? '전체' : st === 'ACTIVE' ? '활성' : '비활성'}
              </button>
            ))}
          </div>
        </div>

        {/* API Key 목록 */}
        <div className="overflow-hidden rounded-xl border border-black/[0.08] bg-white">
          {loading ? (
            <div className="py-12 text-center text-xs text-[#86868b]">API Key 목록을 불러오는 중...</div>
          ) : filteredKeys.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <Key className="mx-auto h-8 w-8 text-[#d2d2d7]" />
              <p className="text-sm font-semibold text-[#1d1d1f]">발급된 API Key가 없습니다.</p>
              <p className="text-xs text-[#86868b]">우측 상단의 &lsquo;새 API Key 발급&rsquo; 버튼을 눌러 연동 키를 생성해 주세요.</p>
            </div>
          ) : (
            <div className="divide-y divide-black/[0.06]">
              {filteredKeys.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 hover:bg-black/[0.02] transition"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-[#1d1d1f]">{item.name}</span>
                      <code className="rounded bg-[#f5f5f7] px-2 py-0.5 text-[11px] font-mono text-[#6e6e73]">
                        {item.keyPrefix}...
                      </code>
                      {item.isActive ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#34c759]/12 px-2 py-0.5 text-[11px] font-semibold text-[#248a3d]">
                          <CheckCircle2 className="h-3 w-3" /> 활성
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#f5f5f7] px-2 py-0.5 text-[11px] font-semibold text-[#6e6e73]">
                          <XCircle className="h-3 w-3" /> 비활성
                        </span>
                      )}
                      {item.scopes.map((sc) => (
                        <span
                          key={sc}
                          className="inline-flex items-center gap-1 rounded-md bg-[#0071e3]/10 px-2 py-0.5 text-[11px] font-medium text-[#0071e3]"
                        >
                          <Shield className="h-3 w-3" />
                          {sc}
                        </span>
                      ))}
                    </div>
                    {item.description && (
                      <p className="text-xs text-[#6e6e73] truncate">{item.description}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-4 text-[11px] text-[#86868b] tabular-nums">
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
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-black/[0.1] bg-white px-2.5 text-xs font-semibold text-[#1d1d1f] hover:bg-black/[0.03] transition"
                      title={item.isActive ? '비활성화' : '활성화'}
                    >
                      <Power className="h-3.5 w-3.5" />
                      <span>{item.isActive ? '비활성화' : '활성화'}</span>
                    </button>
                    {confirmDeleteId === item.id ? (
                      <div className="flex items-center gap-1 rounded-lg border border-[#ff3b30]/25 bg-[#ff3b30]/[0.06] px-2 py-1 text-xs">
                        <button
                          type="button"
                          onClick={() => handleDelete(item)}
                          className="rounded bg-[#ff3b30] px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-[#d70015] transition"
                        >
                          폐기 확인
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded px-1.5 py-0.5 text-[11px] font-medium text-[#6e6e73] hover:bg-black/[0.05] transition"
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(item.id)}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#ff3b30]/25 bg-[#ff3b30]/[0.06] px-2.5 text-xs font-semibold text-[#ff3b30] hover:bg-[#ff3b30]/12 transition"
                        title="영구 폐기"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>폐기</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 점진적 공개: MCP 지원 기능 및 클라이언트 연동 가이드 */}
        <div className="rounded-xl border border-black/[0.08] bg-[#f5f5f7]/60 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowGuide((v) => !v)}
            aria-expanded={showGuide}
            className="w-full flex items-center justify-between px-4 py-3 text-left text-xs font-semibold text-[#1d1d1f] hover:bg-black/[0.03] transition"
          >
            <span className="inline-flex items-center gap-2">
              <Terminal className="h-4 w-4 text-[#0071e3]" />
              <span>MCP 연동 가이드 및 지원 기능 보기</span>
            </span>
            <span className="text-[11px] font-medium text-[#0071e3]">
              {showGuide ? '접기' : '펼치기'}
            </span>
          </button>

          {showGuide && (
            <div className="border-t border-black/[0.06] bg-white p-5 space-y-5">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-[#0071e3]" />
                  <h4 className="text-xs font-bold text-[#1d1d1f]">MCP 지원 기능 요약</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="rounded-lg bg-[#f5f5f7] p-3.5 space-y-1.5">
                    <div className="font-bold text-[#1d1d1f]">읽기 기능 (mcp:read)</div>
                    <ul className="space-y-1 text-[#6e6e73] list-disc list-inside">
                      <li>메일함(폴더) 목록·미읽음 현황 및 사서함 용량 조회</li>
                      <li>메일 목록 조회, 키워드 검색, 정제된 본문·첨부 메타데이터 확인</li>
                      <li>개인 주소록 및 사내 임직원 조직도 검색</li>
                      <li>내 캘린더·공유 캘린더 및 일정 조회</li>
                    </ul>
                  </div>
                  <div className="rounded-lg bg-[#f5f5f7] p-3.5 space-y-1.5">
                    <div className="font-bold text-[#1d1d1f]">쓰기 기능 (mcp:write)</div>
                    <ul className="space-y-1 text-[#6e6e73] list-disc list-inside">
                      <li>메일 읽음/별표 전환, 폴더 이동, 휴지통 이동(영구 삭제 불가), 스팸 신고</li>
                      <li>임시보관함 초안 저장(create_draft) 및 정책 허용 시 발송(send_mail)</li>
                      <li>사용자 정의 메일함 생성 및 개인 주소록 연락처 등록</li>
                      <li>캘린더 새 일정 등록 및 기존 일정 수정</li>
                    </ul>
                  </div>
                </div>
                <p className="text-[11px] text-[#6e6e73]">
                  기본 제공 프롬프트: <code className="rounded bg-[#f5f5f7] px-1.5 py-0.5">daily_mail_briefing</code>(오늘의 메일·일정 브리핑),{' '}
                  <code className="rounded bg-[#f5f5f7] px-1.5 py-0.5">reply_mail_draft</code>(메일 회신 초안 작성)
                </p>
              </div>

              <div className="border-t border-black/[0.06] pt-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-bold text-[#1d1d1f]">MCP 클라이언트 연동 설정</h4>
                  <button
                    type="button"
                    onClick={() => copyText(clientConfigSnippet, 'config')}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-black/[0.1] bg-white px-2.5 text-xs font-semibold text-[#1d1d1f] hover:bg-black/[0.03]"
                  >
                    {copiedConfig ? <Check className="h-3.5 w-3.5 text-[#248a3d]" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copiedConfig ? '복사됨' : '설정 JSON 복사'}</span>
                  </button>
                </div>
                <div className="text-xs text-[#6e6e73] space-y-1">
                  <p>
                    원격 SSE 엔드포인트: <code className="rounded bg-[#f5f5f7] px-1.5 py-0.5 border border-black/[0.06]">{sseEndpointUrl}</code> (헤더 <code className="rounded bg-[#f5f5f7] px-1.5 py-0.5 border border-black/[0.06]">X-API-Key</code>)
                  </p>
                  <p>Claude Desktop / Cursor 설정 예시 (<code className="font-mono">claude_desktop_config.json</code>):</p>
                </div>
                <pre className="overflow-x-auto rounded-lg bg-[#1d1d1f] p-3 text-[11px] font-mono text-[#f5f5f7]">
                  {clientConfigSnippet}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 발급 모달 */}
      {isCreateOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="새 MCP API Key 발급"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsCreateOpen(false);
              setCreateError(null);
            }
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4"
        >
          <form
            onSubmit={handleCreate}
            className="w-full max-w-md rounded-2xl border border-black/[0.08] bg-white p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-base font-bold text-[#1d1d1f]">새 MCP API Key 발급</h4>
              <button
                type="button"
                onClick={() => {
                  setIsCreateOpen(false);
                  setCreateError(null);
                }}
                className="text-xs text-[#6e6e73] hover:text-[#1d1d1f]"
              >
                닫기
              </button>
            </div>

            {createError && (
              <div className="flex items-center gap-2 rounded-xl border border-[#ff3b30]/25 bg-[#ff3b30]/[0.06] px-3 py-2 text-xs font-medium text-[#d70015]">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#1d1d1f] mb-1">
                  명칭 <span className="text-[#ff3b30]">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="예: 업무용 Claude Desktop"
                  className="h-[38px] w-full rounded-lg border border-black/[0.1] px-3 text-xs text-[#1d1d1f] focus:border-[#0071e3] focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1d1d1f] mb-1">설명 (선택)</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="용도 또는 사용 기기 메모"
                  className="h-[38px] w-full rounded-lg border border-black/[0.1] px-3 text-xs text-[#1d1d1f] focus:border-[#0071e3] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1d1d1f] mb-1">만료일 (선택, 미지정 시 무기한)</label>
                <input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="h-[38px] w-full rounded-lg border border-black/[0.1] px-3 text-xs text-[#1d1d1f] focus:border-[#0071e3] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1d1d1f] mb-1.5">
                  허용 권한 스코프 <span className="text-[#ff3b30]">*</span>
                </label>
                <div className="space-y-2">
                  {SCOPE_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className="flex items-start gap-2.5 rounded-lg border border-black/[0.08] p-2.5 cursor-pointer hover:bg-black/[0.02]"
                    >
                      <input
                        type="checkbox"
                        checked={selectedScopes.includes(opt.value)}
                        onChange={() => toggleScope(opt.value)}
                        className="mt-0.5 rounded border-black/20 accent-[#0071e3]"
                      />
                      <div className="text-xs">
                        <div className="font-semibold text-[#1d1d1f]">{opt.label}</div>
                        <div className="text-[#6e6e73]">{opt.desc}</div>
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
                className="h-9 rounded-lg border border-black/[0.1] px-4 text-xs font-semibold text-[#6e6e73] hover:bg-black/[0.03]"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="h-9 rounded-lg bg-[#0071e3] px-4 text-xs font-semibold text-white hover:bg-[#0062c4] disabled:opacity-50"
              >
                {submitting ? '발급 중...' : '발급하기'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 1회 노출 비밀키 확인 모달 (복사 전 배경 클릭/Esc 닫기 차단) */}
      {createdSecret && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="API Key가 발급되었습니다"
          onClick={(e) => {
            if (e.target === e.currentTarget && copiedSecret) {
              setCreatedSecret(null);
            }
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4"
        >
          <div className="w-full max-w-lg rounded-2xl border border-black/[0.08] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-[#248a3d]">
              <Layers className="h-5 w-5" />
              <h4 className="text-base font-bold">API Key가 발급되었습니다</h4>
            </div>
            <p className="text-xs text-[#d70015] font-medium bg-[#ff3b30]/[0.06] border border-[#ff3b30]/20 rounded-lg p-3">
              보안을 위해 전체 API Key는 이 창을 닫으면 다시 확인할 수 없습니다. 반드시 안전한 곳에 복사해 보관하세요.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={createdSecret.rawKey}
                className="h-[38px] flex-1 rounded-lg border border-black/[0.1] bg-[#f5f5f7] px-3 text-xs font-mono text-[#1d1d1f]"
              />
              <button
                type="button"
                onClick={() => copyText(createdSecret.rawKey, 'secret')}
                className="inline-flex h-[38px] items-center gap-1 rounded-lg bg-[#1d1d1f] px-3.5 text-xs font-semibold text-white hover:bg-black"
              >
                {copiedSecret ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedSecret ? '복사 완료' : '복사'}</span>
              </button>
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setCreatedSecret(null)}
                className="h-9 rounded-lg bg-[#0071e3] px-4 text-xs font-semibold text-white hover:bg-[#0062c4]"
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
