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
  Shield,
  ShieldAlert,
  FileWarning,
  Filter,
  ArrowRight,
} from 'lucide-react';

export default function AdminDashboardPage() {
  const [data, setData] = useState<SystemOverviewDto | null>(null);
  const [spamAnalytics, setSpamAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [overviewRes, spamRes] = await Promise.all([
        fetchApi<SystemOverviewDto>('/admin/monitoring/overview'),
        fetchApi<any>('/spam/analytics?range=7d').catch(() => null),
      ]);
      setData(overviewRes);
      setSpamAnalytics(spamRes);
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

      {/* Spam & Security Defense Analytics Section (Phase 4) */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-indigo-600" />
              <span>스팸 및 보안 위협 방어 현황 (최근 7일)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              SPF/DKIM/DMARC 인증, RBL 블랙리스트, 악성 첨부파일 차단 및 격리소 수용 현황입니다.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/quarantine"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 transition border border-rose-200"
            >
              <span>격리함 이동</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
            <Link
              href="/admin/spam-rules"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-50 text-slate-700 hover:bg-slate-100 transition border border-slate-200"
            >
              <span>스팸 룰 관리</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {/* 4 Mini KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-xl bg-slate-50 p-4 border border-slate-200/80">
            <span className="text-xs font-medium text-slate-500">전체 스팸 차단율</span>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-extrabold text-indigo-600">
                {spamAnalytics?.kpi?.blockRatePercent ?? 0}%
              </span>
              <span className="text-xs text-slate-500">차단됨</span>
            </div>
            <div className="mt-1 text-[11px] text-slate-400">
              수신 {spamAnalytics?.kpi?.totalInbound ?? 0}건 중 { (spamAnalytics?.kpi?.spamMails ?? 0) + (spamAnalytics?.kpi?.quarantinedMails ?? 0) }건 방어
            </div>
          </div>

          <div className="rounded-xl bg-rose-50/60 p-4 border border-rose-200/80">
            <span className="text-xs font-medium text-rose-600">고위험 격리(Quarantined)</span>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-extrabold text-rose-700">
                {spamAnalytics?.kpi?.quarantinedMails ?? 0}
              </span>
              <span className="text-xs text-rose-600">건</span>
            </div>
            <div className="mt-1 text-[11px] text-rose-500">
              스팸 점수 10점 이상 / 악성코드
            </div>
          </div>

          <div className="rounded-xl bg-amber-50/60 p-4 border border-amber-200/80">
            <span className="text-xs font-medium text-amber-700">스팸메일함 이동</span>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-extrabold text-amber-700">
                {spamAnalytics?.kpi?.spamMails ?? 0}
              </span>
              <span className="text-xs text-amber-600">건</span>
            </div>
            <div className="mt-1 text-[11px] text-amber-600">
              의심 메일 (5.0 ~ 9.9점)
            </div>
          </div>

          <div className="rounded-xl bg-emerald-50/60 p-4 border border-emerald-200/80">
            <span className="text-xs font-medium text-emerald-700">활성 방어 규칙</span>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-extrabold text-emerald-700">
                {(spamAnalytics?.kpi?.activeRulesCount?.whitelist ?? 0) + (spamAnalytics?.kpi?.activeRulesCount?.blacklist ?? 0)}
              </span>
              <span className="text-xs text-emerald-600">개</span>
            </div>
            <div className="mt-1 text-[11px] text-emerald-600">
              허용 {spamAnalytics?.kpi?.activeRulesCount?.whitelist ?? 0}개 / 차단 {spamAnalytics?.kpi?.activeRulesCount?.blacklist ?? 0}개
            </div>
          </div>
        </div>

        {/* Threat Breakdown Progress Bars */}
        <div className="rounded-xl bg-slate-50 p-4 border border-slate-200 text-xs space-y-3">
          <div className="font-semibold text-slate-800">위협 탐지 유형별 상세 분포</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-3 rounded-lg border border-slate-200">
              <div className="flex items-center justify-between text-slate-600 mb-1">
                <span>SPF/DKIM/DMARC 실패</span>
                <span className="font-bold text-slate-900">{spamAnalytics?.threatBreakdown?.authFailure ?? 0}건</span>
              </div>
              <div className="text-[11px] text-slate-400">발신 도메인 위조 차단</div>
            </div>

            <div className="bg-white p-3 rounded-lg border border-slate-200">
              <div className="flex items-center justify-between text-slate-600 mb-1">
                <span>RBL / KISA 블랙리스트</span>
                <span className="font-bold text-slate-900">{spamAnalytics?.threatBreakdown?.rblBlocked ?? 0}건</span>
              </div>
              <div className="text-[11px] text-slate-400">악성 발송 IP 대역 차단</div>
            </div>

            <div className="bg-white p-3 rounded-lg border border-slate-200">
              <div className="flex items-center justify-between text-slate-600 mb-1">
                <span>악성 첨부파일 / ClamAV</span>
                <span className="font-bold text-slate-900">{spamAnalytics?.threatBreakdown?.malwareAttachment ?? 0}건</span>
              </div>
              <div className="text-[11px] text-slate-400">위험 확장자 및 바이러스</div>
            </div>

            <div className="bg-white p-3 rounded-lg border border-slate-200">
              <div className="flex items-center justify-between text-slate-600 mb-1">
                <span>피싱/사기/블랙리스트</span>
                <span className="font-bold text-slate-900">
                  {(spamAnalytics?.threatBreakdown?.phishingKeyword ?? 0) + (spamAnalytics?.threatBreakdown?.blacklistRule ?? 0)}건
                </span>
              </div>
              <div className="text-[11px] text-slate-400">계정탈취 및 등록 규칙</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
