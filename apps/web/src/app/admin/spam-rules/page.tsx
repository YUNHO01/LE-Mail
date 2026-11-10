'use client';

import React, { useEffect, useState } from 'react';
import { fetchApi } from '@/lib/api';
import {
  SpamRuleDto,
  SpamRuleType,
  SpamRuleTargetType,
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
