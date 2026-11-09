'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchApi } from '@/lib/api';
import { SystemOverviewDto } from '@lemail/shared-types';
import {
  Activity,
  Server,
  Mail,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Layers,
  Radio,
  Send,
  ArrowUpRight,
} from 'lucide-react';

export default function AdminDashboardPage() {
  const [data, setData] = useState<SystemOverviewDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchApi<SystemOverviewDto>('/admin/monitoring/overview');
      setData(res);
    } catch (err: any) {
      setError(err.message || '데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000); // 10초마다 자동 갱신
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">시스템 모니터링 대시보드</h1>
          <p className="text-sm text-slate-500">SMTP 수신 엔진, IMAP 세션, BullMQ 작업 큐 및 리소스 상태를 실시간 감시합니다.</p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm border border-slate-200 hover:bg-slate-50 transition"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          <span>새로고침</span>
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-4 border border-red-200 text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Cards (Responsive Grid) */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {/* Card 1: IMAP 활성 연결 */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500">IMAP 활성 연결</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
              <Radio className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{data?.imap?.activeConnections ?? 0}</span>
            <span className="text-xs text-slate-500">세션</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs font-medium">
            {data?.imap?.isHealthy ? (
              <span className="flex items-center gap-1 text-emerald-600">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                정상 가동 (1143/1993)
              </span>
            ) : (
              <span className="flex items-center gap-1 text-amber-600">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                서비스 오프라인
              </span>
            )}
          </div>
        </div>

        {/* Card 2: 금일 수신 메일 */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500">금일 수신 메일</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
              <Mail className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{data?.todayMails?.todayInboundTotal ?? (data?.todayMails?.todayTotal ?? 0)}</span>
            <span className="text-xs text-slate-500">건</span>
          </div>
          <div className="mt-1 text-xs text-slate-500 font-medium">
            {(data?.todayMails?.todayInboundFailed ?? 0) > 0 ? (
              <span className="text-rose-600 font-bold">수신 실패 {data?.todayMails?.todayInboundFailed}건</span>
            ) : (
              <span className="text-emerald-600">수신 정상 처리됨</span>
            )}
          </div>
        </div>

        {/* Card 3: 금일 발송 메일 및 실패 모니터링 */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500">금일 발송 메일</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
              <Send className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{data?.todayMails?.todayOutboundTotal ?? 0}</span>
            <span className="text-xs text-slate-500">건</span>
          </div>
          <div className="mt-1 text-xs font-medium">
            {(data?.todayMails?.todayOutboundFailed ?? 0) > 0 ? (
              <Link
                href="/admin/logs?direction=OUTBOUND&status=FAILED"
                className="inline-flex items-center gap-1 text-rose-600 font-bold hover:underline"
              >
                <span>발송 실패 {data?.todayMails?.todayOutboundFailed}건</span>
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            ) : (
              <span className="text-emerald-600">발송 실패 없음</span>
            )}
          </div>
        </div>

        {/* Card 4: BullMQ 큐 대기열 */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500">BullMQ 큐 대기열</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <Layers className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{data?.queue.counts.waiting ?? 0}</span>
            <span className="text-xs text-slate-500">건 대기중</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">진행 중(Active): {data?.queue.counts.active ?? 0}</p>
        </div>

        {/* Card 5: 활성 사서함 수 */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500">활성 사서함</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <CheckCircle className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{data?.mailSummary.activeMailboxes ?? '-'}</span>
            <span className="text-xs text-slate-500">개</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">Early Reject $O(1)$ 검증 적용</p>
        </div>

        {/* Card 6: 메모리 사용량 */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500">Node Heap / RSS</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <Server className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{data?.memory.heapUsedMb ?? '-'}</span>
            <span className="text-xs text-slate-500">MB / {data?.memory.rssMb ?? '-'} MB</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">가동 시간: {Math.floor((data?.uptimeSeconds ?? 0) / 60)}분</p>
        </div>
      </div>

      {/* Queue Details Section */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Activity className="h-5 w-5 text-sky-600" />
          <span>BullMQ ('mail-inbound') 상세 작업 현황</span>
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-center">
          <div className="rounded-lg bg-slate-50 p-4 border border-slate-100">
            <div className="text-xs text-slate-500 font-medium">Waiting</div>
            <div className="mt-2 text-xl font-bold text-slate-800">{data?.queue.counts.waiting ?? 0}</div>
          </div>
          <div className="rounded-lg bg-blue-50 p-4 border border-blue-100">
            <div className="text-xs text-blue-600 font-medium">Active</div>
            <div className="mt-2 text-xl font-bold text-blue-800">{data?.queue.counts.active ?? 0}</div>
          </div>
          <div className="rounded-lg bg-emerald-50 p-4 border border-emerald-100">
            <div className="text-xs text-emerald-600 font-medium">Completed</div>
            <div className="mt-2 text-xl font-bold text-emerald-800">{data?.queue.counts.completed ?? 0}</div>
          </div>
          <div className="rounded-lg bg-rose-50 p-4 border border-rose-100">
            <div className="text-xs text-rose-600 font-medium">Failed (DLQ)</div>
            <div className="mt-2 text-xl font-bold text-rose-800">{data?.queue.counts.failed ?? 0}</div>
          </div>
          <div className="rounded-lg bg-purple-50 p-4 border border-purple-100">
            <div className="text-xs text-purple-600 font-medium">Delayed</div>
            <div className="mt-2 text-xl font-bold text-purple-800">{data?.queue.counts.delayed ?? 0}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
