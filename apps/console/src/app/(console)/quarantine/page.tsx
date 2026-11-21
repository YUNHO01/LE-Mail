'use client';

import React, { useEffect, useState } from 'react';
import { fetchApi } from '@/lib/api';
import { QuarantineItemDto, ReleaseMailResponseDto } from '@lemail/shared-types';
import {
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Search,
  RefreshCw,
  AlertTriangle,
  FileText,
  Clock,
  User,
  ArrowRight,
  CheckCircle,
} from 'lucide-react';
import { PageHeader } from '@/components/common';

export default function AdminQuarantinePage() {
  const [items, setItems] = useState<QuarantineItemDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stats, setStats] = useState<{
    totalQuarantined: number;
    highRiskCount: number;
  }>({ totalQuarantined: 0, highRiskCount: 0 });
  const [purging, setPurging] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const queryParams = new URLSearchParams({ limit: '50' });
      if (search.trim()) {
        queryParams.append('search', search.trim());
      }

      const [res, statsRes] = await Promise.all([
        fetchApi<{ items: QuarantineItemDto[]; total: number }>(
          `/admin/quarantine?${queryParams.toString()}`,
        ),
        fetchApi<{ totalQuarantined: number; highRiskCount: number }>(
          '/admin/quarantine/stats',
        ).catch(() => ({ totalQuarantined: 0, highRiskCount: 0 })),
      ]);

      setItems(res.items || []);
      setTotal(res.total || 0);
      setStats(statsRes);
    } catch (err: any) {
      console.error('격리함 조회 실패:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [search]);

  const handleRelease = async (id: string, sender: string) => {
    const addToWhitelist = confirm(
      `이 격리 메일을 승인하여 수신자의 받은편지함으로 전달하시겠습니까?\n\n[확인]: 발신자(${sender})를 전사 화이트리스트에 자동 등록하여 전달\n[취소 시도]: 일반 전달만 진행하시려면 '취소' 후 재선택`,
    );

    try {
      const res = await fetchApi<ReleaseMailResponseDto>(
        `/admin/quarantine/${id}/release`,
        {
          method: 'POST',
          body: JSON.stringify({
            addToWhitelist: addToWhitelist,
          }),
        },
      );
      alert(res.message || '메일이 성공적으로 전달되었습니다.');
      await loadData();
    } catch (err: any) {
      alert(err.message || '메일 승인/전달 실패');
    }
  };

  const handleDrop = async (id: string) => {
    if (!confirm('이 격리 메일을 영구히 삭제하시겠습니까? (복구 불가능)')) {
      return;
    }
    try {
      await fetchApi(`/admin/quarantine/${id}`, { method: 'DELETE' });
      alert('격리 메일이 삭제되었습니다.');
      await loadData();
    } catch (err: any) {
      alert(err.message || '메일 삭제 실패');
    }
  };

  const handlePurgeExpired = async () => {
    if (
      !confirm(
        '30일 이상 경과한 오래된 격리 메일을 일괄 영구 삭제하시겠습니까?\n(디스크 스풀 용량을 확보하며 되돌릴 수 없습니다)',
      )
    ) {
      return;
    }
    try {
      setPurging(true);
      const res: any = await fetchApi('/admin/quarantine/purge-expired', {
        method: 'POST',
        body: JSON.stringify({ retentionDays: 30 }),
      });
      alert(res.message || '만료된 격리 메일이 정리되었습니다.');
      await loadData();
    } catch (err: any) {
      alert(err.message || '만료 메일 정리 실패');
    } finally {
      setPurging(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="스팸 격리함 관리 (Quarantine)"
        icon={<ShieldAlert className="h-6 w-6 text-rose-500" />}
        subtitle="스팸 점수 10점 이상의 고위험 메일 및 피싱 의심 메일이 사용자에게 전달되지 않고 안전하게 격리 보관되는 공간입니다."
      />

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              현재 격리 보관 메일
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <ShieldAlert className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">
              {stats.totalQuarantined}
            </span>
            <span className="text-xs text-slate-500">건</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">관리자 승인 대기 중</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              고위험 피싱 / 악성 의심
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-rose-600">
              {stats.highRiskCount}
            </span>
            <span className="text-xs text-slate-500">건 (스팸점수 ≥ 12.0)</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">즉시 삭제 권장</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              격리 정책 기준
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
              <CheckCircle className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-sm font-bold text-slate-800">
              10.0점 이상 자동 격리
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            5.0~9.9점: 스팸함 / 10.0점 이상: 관리자 격리
          </p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="발신자 또는 메일 제목 검색..."
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-xs focus:border-sky-500 focus:bg-white focus:outline-none transition"
          />
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            type="button"
            onClick={handlePurgeExpired}
            disabled={purging}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 shadow-sm hover:bg-rose-100 transition disabled:opacity-50"
            title="30일 보존 기간이 만료된 오래된 격리 메일 일괄 영구 삭제"
          >
            <Trash2 className="h-3.5 w-3.5 text-rose-600" />
            <span>{purging ? '정리 중...' : '30일 만료 메일 일괄 정리'}</span>
          </button>
          <button
            onClick={loadData}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            <span>새로고침</span>
          </button>
        </div>
      </div>

      {/* Quarantine Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">격리 일시</th>
                <th className="py-3 px-4">발신자</th>
                <th className="py-3 px-4">수신 대상자</th>
                <th className="py-3 px-4">제목</th>
                <th className="py-3 px-4 text-center">스팸 점수</th>
                <th className="py-3 px-4">탐지 사유</th>
                <th className="py-3 px-4 text-right">관리 조치</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    격리 목록을 불러오는 중...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-slate-400">
                    <ShieldCheck className="mx-auto h-10 w-10 text-emerald-500/40 mb-2" />
                    <p className="font-semibold text-slate-700">
                      현재 격리된 고위험 스팸 메일이 없습니다.
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      시스템이 깨끗하고 안전하게 보호되고 있습니다.
                    </p>
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const isCritical = item.spamScore >= 12.0;
                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="py-3 px-4 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                        {new Date(item.createdAt).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900 max-w-[180px] truncate">
                        {item.sender}
                      </td>
                      <td className="py-3 px-4 text-slate-600 max-w-[180px] truncate">
                        {item.recipients.join(', ') || '(지정되지 않음)'}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-800 max-w-[240px] truncate">
                        {item.subject || '(제목 없음)'}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <span
                          className={`inline-block rounded-md border px-2 py-0.5 font-bold ${
                            isCritical
                              ? 'border-rose-300 bg-rose-50 text-rose-700'
                              : 'border-amber-300 bg-amber-50 text-amber-700'
                          }`}
                        >
                          {item.spamScore.toFixed(1)}점
                        </span>
                      </td>
                      <td className="py-3 px-4 max-w-[260px]">
                        <div className="flex flex-wrap gap-1">
                          {item.spamReasons.slice(0, 2).map((r, i) => (
                            <span
                              key={i}
                              className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 truncate max-w-[200px]"
                              title={r}
                            >
                              {r}
                            </span>
                          ))}
                          {item.spamReasons.length > 2 && (
                            <span className="text-[10px] text-slate-400 self-center">
                              +{item.spamReasons.length - 2}건
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => handleRelease(item.id, item.sender)}
                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition shadow-xs"
                            title="정상 메일로 판정하여 수신자 받은편지함으로 전달"
                          >
                            <ShieldCheck className="h-3.5 w-3.5" />
                            <span>승인 및 전달</span>
                          </button>

                          <button
                            onClick={() => handleDrop(item.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition shadow-xs"
                            title="격리 메일 영구 삭제"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>삭제</span>
                          </button>
                        </div>
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
