'use client';

import React, { useEffect, useState } from 'react';
import { fetchApi } from '@/lib/api';
import {
  ShieldCheck,
  ShieldBan,
  Plus,
  Trash2,
  RefreshCw,
  HelpCircle,
} from 'lucide-react';
import { ToastBanner, useToast } from '@/components/common/ToastBanner';

interface SpamRuleItem {
  id: string;
  type: 'WHITELIST' | 'BLACKLIST';
  targetType: 'EMAIL' | 'DOMAIN' | 'IP';
  pattern: string;
  reason?: string;
  createdAt: string;
}

export const SpamBlockSettingsTab: React.FC = () => {
  const [rules, setRules] = useState<SpamRuleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'BLACKLIST' | 'WHITELIST'>('BLACKLIST');

  // 등록 폼 상태
  const [pattern, setPattern] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const { toast, showToast } = useToast();

  const loadRules = async () => {
    try {
      setLoading(true);
      const res: any = await fetchApi('/spam/rules');
      setRules(res || []);
    } catch (err: any) {
      showToast(err.message || '스팸 규칙 목록을 불러오지 못했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRules();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPattern = pattern.toLowerCase().trim();
    if (!cleanPattern) return;

    let targetType: 'EMAIL' | 'DOMAIN' | 'IP' = 'EMAIL';
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(cleanPattern)) {
      targetType = 'IP';
    } else if (!cleanPattern.includes('@') && cleanPattern.includes('.')) {
      targetType = 'DOMAIN';
    }

    try {
      setSaving(true);
      await fetchApi('/spam/rules', {
        method: 'POST',
        body: JSON.stringify({
          type: activeTab,
          targetType,
          pattern: cleanPattern,
          reason: reason.trim() || undefined,
        }),
      });
      setPattern('');
      setReason('');
      showToast('규칙이 등록되었습니다.');
      loadRules();
    } catch (err: any) {
      showToast(err.message || '규칙 등록 실패', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setConfirmDeleteId(null);
    try {
      await fetchApi(`/spam/rules/${id}`, { method: 'DELETE' });
      showToast('규칙이 삭제되었습니다.');
      loadRules();
    } catch (err: any) {
      showToast(err.message || '규칙 삭제 실패', 'error');
    }
  };

  const targetTypeLabelMap: Record<SpamRuleItem['targetType'], string> = {
    EMAIL: '이메일',
    DOMAIN: '도메인',
    IP: 'IP',
  };

  const filteredRules = rules.filter((r) => r.type === activeTab);

  return (
    <div className="space-y-6 rounded-2xl border border-black/[0.08] bg-white p-6 shadow-xs">
      <div className="flex items-center gap-3 border-b border-black/[0.06] pb-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0071e3]/10 text-[#0071e3]">
          <ShieldBan className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-base font-bold text-[#1d1d1f]">개인 스팸 및 수신 차단 설정</h3>
          <p className="text-xs text-[#6e6e73]">
            특정 발신자나 도메인을 개인 수신 차단(블랙리스트) 또는 항상 정상 수신(화이트리스트)으로 관리합니다.
          </p>
        </div>
      </div>

      {/* 안내 배너 */}
      <div className="rounded-xl bg-[#f5f5f7] px-4 py-3 flex items-start gap-2.5 text-xs text-[#6e6e73]">
        <HelpCircle className="h-4 w-4 text-[#86868b] shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          메일 상세 화면에서 <strong>[스팸 신고]</strong>를 누르면 해당 발신자가 개인 수신 차단 목록에 자동 등록되어 다음부터는 스팸메일함으로 직행합니다.
          거래처나 중요한 발신자는 <strong>[수신 허용 목록]</strong>에 등록해 두시면 스팸 분류 위험 없이 항상 받은편지함으로 안전하게 수신됩니다.
        </p>
      </div>

      {/* 서브 탭 네비게이션 */}
      <div className="flex items-center gap-2 border-b border-black/[0.08]">
        <button
          type="button"
          onClick={() => setActiveTab('BLACKLIST')}
          className={`flex items-center gap-2 pb-3 px-3 text-xs font-semibold border-b-2 transition ${
            activeTab === 'BLACKLIST'
              ? 'border-[#ff3b30] text-[#ff3b30]'
              : 'border-transparent text-[#6e6e73] hover:text-[#1d1d1f]'
          }`}
        >
          <ShieldBan className="h-4 w-4" />
          <span>수신 차단 목록 ({rules.filter((r) => r.type === 'BLACKLIST').length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('WHITELIST')}
          className={`flex items-center gap-2 pb-3 px-3 text-xs font-semibold border-b-2 transition ${
            activeTab === 'WHITELIST'
              ? 'border-[#0071e3] text-[#0071e3]'
              : 'border-transparent text-[#6e6e73] hover:text-[#1d1d1f]'
          }`}
        >
          <ShieldCheck className="h-4 w-4" />
          <span>수신 허용 목록 ({rules.filter((r) => r.type === 'WHITELIST').length})</span>
        </button>
      </div>

      {/* 신규 등록 폼 */}
      <div className="rounded-xl border border-black/[0.06] bg-[#f5f5f7]/70 p-4">
        <h4 className="text-xs font-bold text-[#1d1d1f] mb-3 flex items-center gap-1.5">
          <Plus className="h-4 w-4 text-[#0071e3]" />
          <span>신규 {activeTab === 'BLACKLIST' ? '수신 차단' : '수신 허용'} 대상 추가</span>
        </h4>

        <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
          <div className="sm:col-span-6">
            <label htmlFor="spam-rule-pattern" className="block text-xs font-semibold text-[#1d1d1f] mb-1">
              이메일 주소, 도메인 또는 IP
            </label>
            <input
              id="spam-rule-pattern"
              type="text"
              required
              placeholder="예: spammer@bad.com 또는 bad-domain.com"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              className="h-[38px] w-full rounded-lg border border-black/[0.1] bg-white px-3 text-xs text-[#1d1d1f] placeholder-[#86868b] outline-none focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/15 font-mono"
            />
          </div>

          <div className="sm:col-span-4">
            <label htmlFor="spam-rule-reason" className="block text-xs font-semibold text-[#1d1d1f] mb-1">
              메모 / 사유 (선택)
            </label>
            <input
              id="spam-rule-reason"
              type="text"
              placeholder="예: 광고성 이메일 빈번 발송"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="h-[38px] w-full rounded-lg border border-black/[0.1] bg-white px-3 text-xs text-[#1d1d1f] placeholder-[#86868b] outline-none focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/15"
            />
          </div>

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className={`h-[38px] w-full rounded-lg text-xs font-semibold text-white transition disabled:opacity-50 ${
                activeTab === 'BLACKLIST'
                  ? 'bg-[#ff3b30] hover:bg-[#d70015]'
                  : 'bg-[#0071e3] hover:bg-[#0062c4]'
              }`}
            >
              {saving ? '추가 중...' : '추가하기'}
            </button>
          </div>
        </form>
      </div>

      {/* 등록 목록 테이블 */}
      <div className="rounded-xl border border-black/[0.08] bg-white overflow-hidden">
        <div className="p-4 border-b border-black/[0.06] flex items-center justify-between">
          <span className="text-xs font-semibold text-[#6e6e73]">
            총 <strong className="text-[#1d1d1f]">{filteredRules.length}</strong>개 규칙 적용 중
          </span>
          <button
            type="button"
            onClick={loadRules}
            disabled={loading}
            className="p-1.5 rounded-lg text-[#86868b] hover:bg-black/[0.05] hover:text-[#1d1d1f] transition"
            title="새로고침"
            aria-label="새로고침"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-[#0071e3]' : ''}`} />
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-[#86868b]">목록을 불러오는 중...</div>
        ) : filteredRules.length === 0 ? (
          <div className="py-12 text-center text-xs text-[#86868b]">
            등록된 {activeTab === 'BLACKLIST' ? '수신 차단' : '수신 허용'} 규칙이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-black/[0.06] text-xs">
              <thead className="bg-[#f5f5f7] text-[#6e6e73] font-semibold">
                <tr>
                  <th className="px-4 py-3 text-left">구분</th>
                  <th className="px-4 py-3 text-left">대상 이메일 / 도메인</th>
                  <th className="px-4 py-3 text-left">메모 / 사유</th>
                  <th className="px-4 py-3 text-left">등록일시</th>
                  <th className="px-4 py-3 text-right">삭제</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.06]">
                {filteredRules.map((r) => (
                  <tr key={r.id} className="hover:bg-black/[0.02] transition">
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#f5f5f7] text-[#1d1d1f]">
                        {targetTypeLabelMap[r.targetType] || r.targetType}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono font-medium text-[#1d1d1f]">
                      {r.pattern}
                    </td>
                    <td className="px-4 py-3 text-[#6e6e73]">
                      {r.reason || '-'}
                    </td>
                    <td className="px-4 py-3 text-[#86868b] text-[11px] tabular-nums">
                      {r.createdAt ? r.createdAt.slice(0, 16).replace('T', ' ') : '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {confirmDeleteId === r.id ? (
                        <div className="inline-flex items-center gap-1 rounded-lg border border-[#ff3b30]/25 bg-[#ff3b30]/[0.06] px-2 py-1">
                          <button
                            type="button"
                            onClick={() => handleDelete(r.id)}
                            className="rounded bg-[#ff3b30] px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-[#d70015] transition"
                          >
                            삭제 확인
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
                          onClick={() => setConfirmDeleteId(r.id)}
                          className="p-1.5 rounded-lg text-[#86868b] hover:bg-[#ff3b30]/10 hover:text-[#ff3b30] transition"
                          title="규칙 삭제"
                          aria-label={`${r.pattern} 규칙 삭제`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ToastBanner toast={toast} />
    </div>
  );
};
