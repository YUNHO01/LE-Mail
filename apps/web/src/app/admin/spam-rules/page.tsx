'use client';

import React, { useEffect, useState } from 'react';
import { fetchApi } from '@/lib/api';
import {
  SpamRuleDto,
  SpamRuleType,
  SpamRuleTargetType,
  SpamPolicyConfigDto,
  ClamavHealthStatusDto,
} from '@lemail/shared-types';
import {
  ShieldCheck,
  ShieldAlert,
  Plus,
  Trash2,
  Search,
  RefreshCw,
  Globe,
  Mail,
  Network,
  Filter,
  Activity,
  CheckCircle2,
  XCircle,
  Save,
  Server,
  Zap,
} from 'lucide-react';
import { PageHeader } from '@/components/common';

export default function AdminSpamRulesPage() {
  const [rules, setRules] = useState<SpamRuleDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // 새 규칙 입력 상태
  const [newType, setNewType] = useState<SpamRuleType>(SpamRuleType.BLACKLIST);
  const [newTargetType, setNewTargetType] = useState<SpamRuleTargetType>(
    SpamRuleTargetType.EMAIL,
  );
  const [newPattern, setNewPattern] = useState('');
  const [newReason, setNewReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ClamAV 연동 설정 상태
  const [clamavEnabled, setClamavEnabled] = useState(true);
  const [clamavHost, setClamavHost] = useState('127.0.0.1');
  const [clamavPort, setClamavPort] = useState(3310);
  const [clamavTimeoutMs, setClamavTimeoutMs] = useState(3000);
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);

  // ClamAV 즉시 연결 테스트 상태
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<ClamavHealthStatusDto | null>(null);

  const loadSpamConfig = async () => {
    try {
      setConfigLoading(true);
      const conf = await fetchApi<SpamPolicyConfigDto>('/spam/config');
      if (conf) {
        setClamavEnabled(conf.clamavEnabled !== false);
        if (conf.clamavHost) setClamavHost(conf.clamavHost);
        if (conf.clamavPort) setClamavPort(conf.clamavPort);
        if (conf.clamavTimeoutMs) setClamavTimeoutMs(conf.clamavTimeoutMs);
      }
    } catch (err: any) {
      console.error('스팸 정책 조회 실패:', err);
    } finally {
      setConfigLoading(false);
    }
  };

  const handleTestClamav = async () => {
    try {
      setTestingConnection(true);
      setTestResult(null);
      const res = await fetchApi<ClamavHealthStatusDto>('/spam/clamav/test-connection', {
        method: 'POST',
        body: JSON.stringify({
          host: clamavHost.trim(),
          port: Number(clamavPort),
          timeoutMs: Number(clamavTimeoutMs),
        }),
      });
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        enabled: true,
        isHealthy: false,
        host: clamavHost,
        port: clamavPort,
        errorMessage: err.message || '테스트 요청 실패',
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSaveClamavConfig = async () => {
    try {
      setConfigSaving(true);
      await fetchApi('/spam/config', {
        method: 'PATCH',
        body: JSON.stringify({
          clamavEnabled,
          clamavHost: clamavHost.trim(),
          clamavPort: Number(clamavPort),
          clamavTimeoutMs: Number(clamavTimeoutMs),
        }),
      });
      alert('ClamAV 안티바이러스 연동 설정이 성공적으로 저장되었습니다.');
    } catch (err: any) {
      alert(err.message || '설정 저장 실패');
    } finally {
      setConfigSaving(false);
    }
  };

  const loadRules = async () => {
    try {
      setLoading(true);
      const data = await fetchApi<SpamRuleDto[]>('/spam/rules');
      setRules(data || []);
    } catch (err: any) {
      console.error('스팸 규칙 조회 실패:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRules();
    loadSpamConfig();
  }, []);

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPattern.trim()) {
      alert('차단/허용 패턴을 입력해 주세요.');
      return;
    }

    try {
      setIsSubmitting(true);
      await fetchApi('/spam/rules', {
        method: 'POST',
        body: JSON.stringify({
          type: newType,
          targetType: newTargetType,
          pattern: newPattern.trim(),
          reason: newReason.trim() || undefined,
          isGlobal: true,
        }),
      });

      alert('전사 스팸 정책 규칙이 등록되었습니다.');
      setNewPattern('');
      setNewReason('');
      await loadRules();
    } catch (err: any) {
      alert(err.message || '규칙 등록 실패');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteRule = async (id: string, pattern: string) => {
    if (!confirm(`'${pattern}' 규칙을 삭제하시겠습니까?`)) {
      return;
    }

    try {
      await fetchApi(`/spam/rules/${id}`, { method: 'DELETE' });
      alert('규칙이 삭제되었습니다.');
      await loadRules();
    } catch (err: any) {
      alert(err.message || '규칙 삭제 실패');
    }
  };

  const filteredRules = rules.filter(
    (r) =>
      !search ||
      r.pattern.toLowerCase().includes(search.toLowerCase()) ||
      (r.reason && r.reason.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="스팸 필터 및 차단 정책 (Whitelist & Blacklist)"
        icon={<Filter className="h-6 w-6 text-indigo-500" />}
        subtitle="전사 또는 도메인 단위의 이메일 수신 허용(화이트리스트) 및 차단(블랙리스트) 규칙을 관리합니다."
      />

      {/* ClamAV 안티바이러스 연동 설정 및 즉시 연결 테스트 카드 */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>ClamAV 안티바이러스 연동 설정</span>
                <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                  clamavEnabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                }`}>
                  {clamavEnabled ? '실시간 검사 ON' : '검사 OFF'}
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                수신 메일의 첨부파일 버퍼를 clamd TCP 데몬(3310)으로 스트리밍하여 바이러스 및 악성코드를 검사합니다.
              </p>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <span className="text-xs font-semibold text-slate-700">백신 검사 활성화</span>
            <input
              type="checkbox"
              checked={clamavEnabled}
              onChange={(e) => setClamavEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
          </label>
        </div>

        {/* 연결 파라미터 입력 필드 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              ClamAV 데몬 호스트 / IP
            </label>
            <input
              type="text"
              value={clamavHost}
              onChange={(e) => setClamavHost(e.target.value)}
              disabled={!clamavEnabled}
              placeholder="예: 127.0.0.1 또는 clamav"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 px-3 text-xs focus:border-indigo-500 focus:bg-white focus:outline-none disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              TCP 포트
            </label>
            <input
              type="number"
              value={clamavPort}
              onChange={(e) => setClamavPort(Number(e.target.value))}
              disabled={!clamavEnabled}
              placeholder="기본값: 3310"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 px-3 text-xs focus:border-indigo-500 focus:bg-white focus:outline-none disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              타임아웃 (ms)
            </label>
            <input
              type="number"
              value={clamavTimeoutMs}
              onChange={(e) => setClamavTimeoutMs(Number(e.target.value))}
              disabled={!clamavEnabled}
              placeholder="기본값: 3000"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 px-3 text-xs focus:border-indigo-500 focus:bg-white focus:outline-none disabled:opacity-50"
            />
          </div>
        </div>

        {/* 테스트 결과 표시 배너 */}
        {testResult && (
          <div className={`rounded-lg p-3 text-xs flex items-start gap-2.5 border ${
            testResult.isHealthy
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}>
            {testResult.isHealthy ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <XCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <div className="font-semibold">
                {testResult.isHealthy ? 'ClamAV 데몬 연결 성공' : 'ClamAV 데몬 연결 실패'}
              </div>
              <div className="mt-0.5 text-[11px]">
                {testResult.isHealthy ? (
                  <>
                    <span>엔진 버전: <strong className="font-mono">{testResult.version}</strong></span>
                    <span className="mx-2">|</span>
                    <span>응답 지연시간: <strong>{testResult.latencyMs}ms</strong></span>
                  </>
                ) : (
                  <span>원인: {testResult.errorMessage}</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 안내문구 및 하단 버튼 */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
          <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-400"></span>
            <span>ClamAV 데몬이 미설치/오프라인이어도 Fail-safe 회로에 의해 메일 수신이 안전하게 자동 우회(Bypass)되어 정상 수신됩니다.</span>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              onClick={handleTestClamav}
              disabled={testingConnection}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition disabled:opacity-50"
            >
              <Activity className={`h-3.5 w-3.5 text-indigo-500 ${testingConnection ? 'animate-spin' : ''}`} />
              <span>{testingConnection ? '연결 확인 중...' : '연결 테스트 (Ping)'}</span>
            </button>

            <button
              type="button"
              onClick={handleSaveClamavConfig}
              disabled={configSaving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 transition disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              <span>{configSaving ? '저장 중...' : '설정 저장'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 새 규칙 등록 카드 */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Plus className="h-4 w-4 text-indigo-600" />
          <span>새 전사 차단/허용 규칙 등록</span>
        </h2>

        <form onSubmit={handleCreateRule} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              규칙 구분
            </label>
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as SpamRuleType)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 px-3 text-xs focus:border-indigo-500 focus:bg-white focus:outline-none"
            >
              <option value={SpamRuleType.BLACKLIST}>수신 차단 (블랙리스트)</option>
              <option value={SpamRuleType.WHITELIST}>수신 허용 (화이트리스트)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              대상 유형
            </label>
            <select
              value={newTargetType}
              onChange={(e) =>
                setNewTargetType(e.target.value as SpamRuleTargetType)
              }
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 px-3 text-xs focus:border-indigo-500 focus:bg-white focus:outline-none"
            >
              <option value={SpamRuleTargetType.EMAIL}>이메일 주소 (e.g. bad@spammer.com)</option>
              <option value={SpamRuleTargetType.DOMAIN}>도메인 (e.g. spammer.com)</option>
              <option value={SpamRuleTargetType.IP}>IP 주소 (e.g. 192.168.1.1)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              패턴 (이메일, 도메인, IP)
            </label>
            <input
              type="text"
              required
              value={newPattern}
              onChange={(e) => setNewPattern(e.target.value)}
              placeholder="예: @bad-spammer.com"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 px-3 text-xs focus:border-indigo-500 focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              등록 사유
            </label>
            <input
              type="text"
              value={newReason}
              onChange={(e) => setNewReason(e.target.value)}
              placeholder="예: 해외 도박성 대량 스팸 도메인"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 px-3 text-xs focus:border-indigo-500 focus:bg-white focus:outline-none"
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-lg bg-indigo-600 py-2 px-4 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 transition disabled:opacity-50"
            >
              {isSubmitting ? '등록 중...' : '규칙 추가'}
            </button>
          </div>
        </form>
      </div>

      {/* Rules Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <div className="relative w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="패턴 또는 사유 검색..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs focus:border-indigo-500 focus:bg-white focus:outline-none"
            />
          </div>

          <button
            onClick={loadRules}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            <span>새로고침</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">구분</th>
                <th className="py-3 px-4">대상 유형</th>
                <th className="py-3 px-4">패턴</th>
                <th className="py-3 px-4">적용 범위</th>
                <th className="py-3 px-4">등록 사유</th>
                <th className="py-3 px-4">등록 일시</th>
                <th className="py-3 px-4 text-right">삭제</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    규칙 목록을 불러오는 중...
                  </td>
                </tr>
              ) : filteredRules.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    등록된 스팸 차단/허용 규칙이 없습니다.
                  </td>
                </tr>
              ) : (
                filteredRules.map((rule) => {
                  const isWhitelist = rule.type === SpamRuleType.WHITELIST;
                  return (
                    <tr key={rule.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-block rounded-md border px-2 py-0.5 text-[11px] font-bold ${
                            isWhitelist
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                              : 'border-rose-300 bg-rose-50 text-rose-700'
                          }`}
                        >
                          {isWhitelist ? '수신 허용' : '수신 차단'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {rule.targetType}
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                        {rule.pattern}
                      </td>
                      <td className="py-3 px-4 text-slate-500">
                        {rule.userId ? '개인 규칙' : '전사 공통 (Global)'}
                      </td>
                      <td className="py-3 px-4 text-slate-600 max-w-[200px] truncate">
                        {rule.reason || '-'}
                      </td>
                      <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                        {new Date(rule.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleDeleteRule(rule.id, rule.pattern)}
                          className="inline-flex items-center gap-1 text-rose-600 hover:text-rose-700 transition"
                          title="규칙 삭제"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
