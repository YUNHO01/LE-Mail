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

  const loadRules = async () => {
    try {
      setLoading(true);
      const res: any = await fetchApi('/spam/rules');
      setRules(res || []);
    } catch (err: any) {
      alert(err.message || '스팸 규칙 목록을 불러오지 못했습니다.');
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
    if (!cleanPattern.includes('@') && cleanPattern.includes('.')) {
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
      loadRules();
    } catch (err: any) {
      alert(err.message || '규칙 등록 실패');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, pat: string) => {
    if (!confirm(`'${pat}' 규칙을 삭제하시겠습니까?`)) return;
    try {
      await fetchApi(`/spam/rules/${id}`, { method: 'DELETE' });
      loadRules();
    } catch (err: any) {
      alert(err.message || '규칙 삭제 실패');
    }
  };

  const filteredRules = rules.filter((r) => r.type === activeTab);

  return (
    <div className="space-y-6 w-full">
      <div>
        <h2 className="text-base font-bold tracking-tight text-slate-900">개인 스팸 및 수신 차단 설정</h2>
        <p className="text-xs text-slate-500 mt-1">
          특정 발신자나 도메인을 개인 수신 차단(블랙리스트) 또는 항상 정상 수신(화이트리스트)으로 관리합니다.
        </p>
      </div>

      {/* 안내 배너 */}
      <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4 flex items-start gap-3 text-xs text-sky-900">
        <HelpCircle className="h-4 w-4 text-sky-600 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-semibold">스팸 신고 및 자동 분류 동작 안내</div>
          <p className="text-sky-800 leading-relaxed">
            메일 상세 화면에서 <strong>[스팸 신고]</strong>를 누르면 해당 발신자가 개인 수신 차단 목록에 자동 등록되어 다음부터는 스팸메일함으로 직행합니다.
            거래처나 중요한 발신자는 <strong>[수신 허용 목록]</strong>에 등록해 두시면 스팸 분류 위험 없이 항상 받은편지함으로 안전하게 수신됩니다.
          </p>
        </div>
      </div>

      {/* 서브 탭 네비게이션 */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab('BLACKLIST')}
          className={`flex items-center gap-2 pb-3 px-3 text-sm font-semibold border-b-2 transition ${
            activeTab === 'BLACKLIST'
              ? 'border-rose-600 text-rose-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ShieldBan className="h-4 w-4" />
          <span>수신 차단 목록 ({rules.filter((r) => r.type === 'BLACKLIST').length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('WHITELIST')}
          className={`flex items-center gap-2 pb-3 px-3 text-sm font-semibold border-b-2 transition ${
            activeTab === 'WHITELIST'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ShieldCheck className="h-4 w-4" />
          <span>수신 허용 목록 ({rules.filter((r) => r.type === 'WHITELIST').length})</span>
        </button>
      </div>

      {/* 신규 등록 폼 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
          <Plus className="h-4 w-4 text-slate-600" />
          <span>신규 {activeTab === 'BLACKLIST' ? '수신 차단' : '수신 허용'} 대상 추가</span>
        </h3>

        <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
          <div className="sm:col-span-6">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              이메일 주소 또는 도메인
            </label>
            <input
              type="text"
              required
              placeholder="예: spammer@bad.com 또는 bad-domain.com"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-mono"
            />
          </div>

          <div className="sm:col-span-4">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              메모 / 사유 (선택)
            </label>
            <input
              type="text"
              placeholder="예: 광고성 이메일 빈번 발송"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className={`h-10 w-full rounded-xl text-xs font-semibold text-white transition disabled:opacity-50 ${
                activeTab === 'BLACKLIST'
                  ? 'bg-rose-600 hover:bg-rose-500'
                  : 'bg-emerald-600 hover:bg-emerald-500'
              }`}
            >
              {saving ? '추가 중...' : '추가하기'}
            </button>
          </div>
        </form>
      </div>

      {/* 등록 목록 테이블 */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-700">
            총 <strong className="text-slate-900">{filteredRules.length}</strong>개 규칙 적용 중
          </span>
          <button
            type="button"
            onClick={loadRules}
            disabled={loading}
            className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
            title="새로고침"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-slate-400">목록을 불러오는 중...</div>
        ) : filteredRules.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">
            등록된 {activeTab === 'BLACKLIST' ? '수신 차단' : '수신 허용'} 규칙이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-xs">
              <thead className="bg-slate-50 text-slate-500 font-semibold">
                <tr>
                  <th className="px-4 py-3 text-left">구분</th>
                  <th className="px-4 py-3 text-left">대상 이메일 / 도메인</th>
                  <th className="px-4 py-3 text-left">메모 / 사유</th>
                  <th className="px-4 py-3 text-left">등록일시</th>
                  <th className="px-4 py-3 text-right">삭제</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRules.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60 transition">
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                        {r.targetType}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono font-medium text-slate-900">
                      {r.pattern}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {r.reason || '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-[11px]">
                      {r.createdAt ? r.createdAt.slice(0, 16).replace('T', ' ') : '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(r.id, r.pattern)}
                        className="p-1 rounded text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                        title="규칙 삭제"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
