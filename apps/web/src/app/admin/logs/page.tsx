'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { fetchApi } from '@/lib/api';
import { MailMessageDto, BulkRetryResponseDto, RetryMailResponseDto } from '@lemail/shared-types';
import { PageHeader, SearchInput, TableUtilityButtons } from '@/components/common';
import { exportTableToExcel } from '@/lib/excel';
import {
  Layers,
  ShieldCheck,
  RefreshCw,
  FileText,
  ChevronLeft,
  ChevronRight,
  User,
  CheckCircle2,
  AlertCircle,
  FileDown,
  ArrowUpRight,
  ArrowDownLeft,
  RotateCw,
  Info,
  X,
  AlertTriangle,
  Send,
  Copy,
  Check,
} from 'lucide-react';

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<MailMessageDto[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'PROCESSED' | 'FAILED' | 'QUEUED'>('all');
  const [directionFilter, setDirectionFilter] = useState<'all' | 'INBOUND' | 'OUTBOUND'>('all');
  const [loading, setLoading] = useState(true);

  // Selection & Pagination
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Retry processing state
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [bulkRetrying, setBulkRetrying] = useState(false);

  // Failure detail modal
  const [failureModalMail, setFailureModalMail] = useState<MailMessageDto | null>(null);
  const [copiedReason, setCopiedReason] = useState(false);

  const loadLogs = async () => {
    try {
      setLoading(true);
      let url = `/mails?search=${encodeURIComponent(search)}&limit=100`;
      if (statusFilter !== 'all') {
        url += `&status=${statusFilter}`;
      }
      if (directionFilter !== 'all') {
        url += `&direction=${directionFilter}`;
      }

      const res = await fetchApi<{ items: MailMessageDto[]; total: number }>(url);
      setLogs(res.items || []);
      setTotal(res.total || 0);
      setSelectedIds([]);
      setPage(1);
    } catch (err: any) {
      console.error('Failed to load logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [search, statusFilter, directionFilter]);

  // 클라이언트 측 보조 필터링
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchStatus = statusFilter === 'all' || log.status === statusFilter;
      const matchDir = directionFilter === 'all' || log.direction === directionFilter;
      return matchStatus && matchDir;
    });
  }, [logs, statusFilter, directionFilter]);

  // 페이징 계산
  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedLogs = filteredLogs.slice(startIndex, startIndex + pageSize);

  const displayStart = filteredLogs.length === 0 ? 0 : startIndex + 1;
  const displayEnd = Math.min(startIndex + pageSize, filteredLogs.length);

  // 선택 핸들러
  const allCurrentSelected =
    paginatedLogs.length > 0 && paginatedLogs.every((m) => selectedIds.includes(m.id));

  const handleSelectAll = () => {
    if (allCurrentSelected) {
      setSelectedIds((prev) =>
        prev.filter((id) => !paginatedLogs.some((m) => m.id === id))
      );
    } else {
      const toAdd = paginatedLogs.map((m) => m.id);
      setSelectedIds((prev) => Array.from(new Set([...prev, ...toAdd])));
    }
  };

  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // 단건 재발송 처리
  const handleRetry = async (mail: MailMessageDto) => {
    try {
      setRetryingId(mail.id);
      const res = await fetchApi<RetryMailResponseDto>(`/mails/${mail.id}/retry`, {
        method: 'POST',
      });
      if (res.success) {
        alert(`메일(ID: ${mail.id.slice(0, 8)}) 재발송이 성공적으로 처리되었습니다.`);
        if (failureModalMail?.id === mail.id) {
          setFailureModalMail(null);
        }
        await loadLogs();
      } else {
        alert(`재발송 실패: ${res.failureReason || '알 수 없는 오류'}`);
        await loadLogs();
      }
    } catch (err: any) {
      alert(`재발송 요청 중 오류가 발생했습니다: ${err.message}`);
    } finally {
      setRetryingId(null);
    }
  };

  // 선택된 발송 실패 메일 일괄 재발송
  const selectedFailedOutboundMails = useMemo(() => {
    return filteredLogs.filter(
      (m) =>
        selectedIds.includes(m.id) &&
        m.direction === 'OUTBOUND' &&
        m.status === 'FAILED'
    );
  }, [filteredLogs, selectedIds]);

  const handleBulkRetry = async () => {
    if (selectedFailedOutboundMails.length === 0) return;
    const confirmMsg = `선택한 ${selectedFailedOutboundMails.length}건의 발송 실패 메일을 지금 재발송하시겠습니까?`;
    if (!confirm(confirmMsg)) return;

    try {
      setBulkRetrying(true);
      const ids = selectedFailedOutboundMails.map((m) => m.id);
      const res = await fetchApi<BulkRetryResponseDto>('/mails/bulk-retry', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      });

      alert(
        `일괄 재발송 완료!\n총 ${res.total}건 중 성공 ${res.succeeded}건, 실패 ${res.failed}건`
      );
      await loadLogs();
    } catch (err: any) {
      alert(`일괄 재발송 처리 중 오류: ${err.message}`);
    } finally {
      setBulkRetrying(false);
    }
  };

  // 클립보드 복사
  const handleCopy = async () => {
    const targets =
      selectedIds.length > 0
        ? filteredLogs.filter((m) => selectedIds.includes(m.id))
        : paginatedLogs;

    if (targets.length === 0) return;

    const header = ['일자', '구분', '발신자', '수신자', '상태', '제목', '실패사유/보안인증'].join('\t');
    const rows = targets.map((m) => {
      const date = new Date(m.createdAt);
      const dateStr = date.toISOString().slice(0, 10);
      const timeStr = date.toTimeString().slice(0, 8);
      const recipients = (m.recipients || []).map((r) => r.address).join('; ');
      const extraInfo =
        m.direction === 'OUTBOUND'
          ? m.failureReason || 'Direct MX / SMTP Relay'
          : [
              m.spfResult ? `SPF:${m.spfResult}` : '',
              m.dkimResult ? `DKIM:${m.dkimResult}` : '',
              m.dmarcResult ? `DMARC:${m.dmarcResult}` : '',
            ]
              .filter(Boolean)
              .join(' ');

      return [
        `${dateStr} ${timeStr}`,
        m.direction,
        m.sender,
        recipients,
        m.status,
        m.subject || '(제목 없음)',
        extraInfo,
      ].join('\t');
    });

    const text = [header, ...rows].join('\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Excel (.xlsx) 다운로드 (해당 페이지 목록 또는 선택된 항목)
  const handleExcelExport = () => {
    const targets =
      selectedIds.length > 0
        ? filteredLogs.filter((m) => selectedIds.includes(m.id))
        : paginatedLogs;

    if (targets.length === 0) {
      alert('내보낼 로그 데이터가 없습니다.');
      return;
    }

    const headers = ['일자', '시각', '구분', '발신자', '수신자', '상태', '제목', '실패사유/보안인증', '메시지ID'];
    const rows = targets.map((m) => {
      const date = new Date(m.createdAt);
      const dateStr = date.toISOString().slice(0, 10);
      const timeStr = date.toTimeString().slice(0, 8);
      const recipients = (m.recipients || []).map((r) => r.address).join('; ');
      const extraInfo =
        m.direction === 'OUTBOUND'
          ? m.failureReason || 'Direct MX / SMTP Relay'
          : [
              m.spfResult ? `SPF:${m.spfResult}` : '',
              m.dkimResult ? `DKIM:${m.dkimResult}` : '',
              m.dmarcResult ? `DMARC:${m.dmarcResult}` : '',
            ]
              .filter(Boolean)
              .join(' ');

      return [
        dateStr,
        timeStr,
        m.direction,
        m.sender,
        recipients,
        m.status,
        m.subject || '(제목 없음)',
        extraInfo,
        m.id,
      ];
    });

    const today = new Date().toISOString().slice(0, 10);
    exportTableToExcel({
      filename: `LEMail_MailAuditLogs_${today}.xlsx`,
      sheetName: '감사로그',
      headers,
      rows,
    });
  };

  const handlePrint = () => {
    window.print();
  };

  const formatDateParts = (iso: string) => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return { dateStr: '-', timeStr: '-' };
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
    const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(
      2,
      '0'
    )}:${String(d.getSeconds()).padStart(2, '0')}`;
    return { dateStr, timeStr };
  };

  const extractPersonInfo = (senderRaw: string) => {
    if (!senderRaw) return { name: '(없음)', address: '' };
    const match = senderRaw.match(/^(.*?)(?:<(.+?)>)?$/);
    if (match) {
      const name = match[1].trim() || match[2] || senderRaw;
      const address = match[2] || (match[1].includes('@') ? match[1].trim() : '');
      return { name, address };
    }
    return { name: senderRaw, address: '' };
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <PageHeader
        title="메일 송수신 및 발송 실패 감사 로그"
        icon={<Layers className="h-6 w-6 text-sky-600" />}
        subtitle="인바운드 수신 보안 인증(SPF/DKIM/DMARC) 및 아웃바운드 발송 실패 내역을 추적하고 재발송(Retry)을 관리합니다. (개인정보 보호를 위해 EML 원본은 오류 메일에 한해 제한적으로 제공됩니다)"
        action={
          <button
            onClick={loadLogs}
            disabled={loading}
            className="btn btn-sm btn-secondary inline-flex items-center gap-1.5 text-xs font-semibold print:hidden"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            <span>새로고침</span>
          </button>
        }
      />

      {/* Main Table Container */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden transition printable-area">
        {/* 인쇄 전용 헤더 (인쇄 시 상단에만 노출) */}
        <div className="hidden print:block p-4 border-b-2 border-slate-800">
          <h2 className="text-base font-bold text-slate-900">[LEMail] 메일 수신 및 보안 로그 목록</h2>
          <div className="text-xs text-slate-600 mt-1">
            출력일시: {new Date().toLocaleString('ko-KR')} | 목록 {paginatedLogs.length}건
          </div>
        </div>

        {/* 상단 툴바: [구분 필터] -> [상태 필터] -> [검색창] / 버튼군 */}
        <div className="p-4 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 bg-white print-toolbar print:hidden">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* 1. 송수신 구분 필터 */}
            <select
              value={directionFilter}
              onChange={(e) => setDirectionFilter(e.target.value as any)}
              className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none transition focus:border-sky-500 shadow-xs"
            >
              <option value="all">전체 구분 (송/수신)</option>
              <option value="OUTBOUND">발송 메일 (OUTBOUND)</option>
              <option value="INBOUND">수신 메일 (INBOUND)</option>
            </select>

            {/* 2. 상태 필터 */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none transition focus:border-sky-500 shadow-xs"
            >
              <option value="all">모든 상태</option>
              <option value="FAILED">FAILED (발송/수신 실패)</option>
              <option value="PROCESSED">PROCESSED (정상 완료)</option>
              <option value="QUEUED">QUEUED (대기 중)</option>
            </select>

            {/* 3. 검색창 */}
            <div className="w-64">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="발신자, 제목 검색..."
                size="md"
              />
            </div>
          </div>

          {/* 우측: 유틸리티 및 재발송 버튼군 */}
          <div className="flex items-center gap-2 self-end lg:self-auto flex-wrap">
            {/* 다중 선택 일괄 뱃지 및 일괄 재발송 버튼 */}
            {selectedIds.length > 0 && (
              <div className="flex items-center gap-2 mr-1 pr-2 border-r border-slate-200">
                <span className="text-xs font-semibold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-lg border border-sky-200">
                  {selectedIds.length}개 선택
                </span>

                {selectedFailedOutboundMails.length > 0 && (
                  <button
                    onClick={handleBulkRetry}
                    disabled={bulkRetrying}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-lg bg-rose-600 text-white hover:bg-rose-700 transition shadow-xs disabled:opacity-50"
                  >
                    <RotateCw className={`h-3 w-3 ${bulkRetrying ? 'animate-spin' : ''}`} />
                    <span>실패 메일 일괄 재발송 ({selectedFailedOutboundMails.length}건)</span>
                  </button>
                )}
              </div>
            )}

            <TableUtilityButtons
              onCopy={handleCopy}
              onExcel={handleExcelExport}
              onPrint={handlePrint}
              copied={copied}
            />
          </div>
        </div>

        {/* 데이터 테이블 */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50 text-slate-600 font-medium select-none">
                <th className="w-10 px-4 py-3 text-center print:hidden">
                  <input
                    type="checkbox"
                    checked={allCurrentSelected}
                    onChange={handleSelectAll}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                    title="전체 선택"
                  />
                </th>
                <th className="w-24 px-4 py-3 whitespace-nowrap">구분</th>
                <th className="w-28 px-4 py-3 whitespace-nowrap">일시</th>
                <th className="w-56 px-4 py-3 whitespace-nowrap">송/수신 정보</th>
                <th className="w-28 px-4 py-3 text-center whitespace-nowrap">처리 상태</th>
                <th className="px-4 py-3 whitespace-nowrap">제목</th>
                <th className="w-48 px-4 py-3 whitespace-nowrap">실패 사유 / 인증</th>
                <th className="w-32 px-4 py-3 text-center whitespace-nowrap print:hidden">관리 액션</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="h-5 w-5 animate-spin text-sky-600" />
                      <span className="font-medium">로그를 불러오는 중...</span>
                    </div>
                  </td>
                </tr>
              ) : paginatedLogs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center">
                      <FileText className="h-10 w-10 text-slate-300 mb-2 stroke-1" />
                      <p className="font-semibold text-slate-600 text-sm">기록된 메일 로그가 없습니다.</p>
                      <p className="text-xs text-slate-400 mt-1">인바운드 수신 또는 아웃바운드 발송 시 자동으로 로그가 기록됩니다.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedLogs.map((log) => {
                  const isSelected = selectedIds.includes(log.id);
                  const { dateStr, timeStr } = formatDateParts(log.createdAt);
                  const { name, address } = extractPersonInfo(log.sender);
                  const isOutbound = log.direction === 'OUTBOUND';
                  const isFailed = log.status === 'FAILED';
                  const recipients = log.recipients || [];
                  const toAddresses = recipients.map((r) => r.address).join(', ');

                  return (
                    <tr
                      key={log.id}
                      className={`transition-colors duration-100 hover:bg-slate-50/80 ${
                        isSelected ? 'bg-sky-50/40' : 'bg-white'
                      }`}
                    >
                      {/* 선택 체크박스 */}
                      <td
                        className="px-4 py-3.5 text-center print:hidden"
                        onClick={(e) => handleToggleSelect(log.id, e)}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                        />
                      </td>

                      {/* 1. 구분 (INBOUND / OUTBOUND) */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        {isOutbound ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700 border border-purple-200">
                            <ArrowUpRight className="h-3 w-3 text-purple-600" />
                            <span>발송</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 border border-sky-200">
                            <ArrowDownLeft className="h-3 w-3 text-sky-600" />
                            <span>수신</span>
                          </span>
                        )}
                      </td>

                      {/* 2. 일시 */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-slate-600 font-mono text-[11px]">
                        <div>{dateStr}</div>
                        <div className="text-slate-400 text-[10px]">{timeStr}</div>
                      </td>

                      {/* 3. 송/수신 정보 */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-1 ${
                              isOutbound
                                ? 'bg-purple-50 text-purple-700 ring-purple-200'
                                : 'bg-slate-100 text-slate-600 ring-slate-200'
                            }`}
                          >
                            {isOutbound ? <Send className="h-3.5 w-3.5" /> : name ? name.slice(0, 1).toUpperCase() : <User className="h-3.5 w-3.5" />}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 truncate max-w-[190px]">
                              {isOutbound ? `To: ${toAddresses || '(수신자 없음)'}` : name}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate max-w-[190px]">
                              {isOutbound ? `From: ${log.sender}` : address}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 4. 처리 상태 */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        {log.status === 'PROCESSED' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                            <span>정상 처리</span>
                          </span>
                        ) : isFailed ? (
                          <button
                            onClick={() => setFailureModalMail(log)}
                            className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-bold text-rose-700 border border-rose-200 hover:bg-rose-100 transition cursor-pointer"
                            title="클릭하여 상세 실패 원인 확인"
                          >
                            <AlertCircle className="h-3 w-3 text-rose-600" />
                            <span>실패 확인</span>
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-700 border border-amber-200">
                            대기 중
                          </span>
                        )}
                      </td>

                      {/* 5. 제목 */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="truncate max-w-sm font-medium text-slate-900">
                            {log.subject || '(제목 없음)'}
                          </span>
                          <span
                            className="font-mono text-[10px] text-slate-400 truncate max-w-[90px]"
                            title={log.id}
                          >
                            #{log.id.slice(0, 6)}
                          </span>
                        </div>
                      </td>

                      {/* 6. 실패 사유 또는 보안 인증 */}
                      <td className="px-4 py-3.5 text-slate-500 whitespace-nowrap text-[11px]">
                        {isOutbound ? (
                          isFailed && log.failureReason ? (
                            <div
                              onClick={() => setFailureModalMail(log)}
                              className="text-rose-600 font-medium truncate max-w-[180px] cursor-pointer hover:underline flex items-center gap-1"
                              title={log.failureReason}
                            >
                              <AlertTriangle className="h-3 w-3 shrink-0" />
                              <span className="truncate">{log.failureReason}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400">Direct MX / Relay</span>
                          )
                        ) : (
                          <div className="flex items-center gap-1 flex-wrap">
                            {log.spfResult === 'PASS' && (
                              <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                                SPF
                              </span>
                            )}
                            {log.dkimResult === 'PASS' && (
                              <span className="rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 border border-sky-200">
                                DKIM
                              </span>
                            )}
                            {log.dmarcResult === 'PASS' && (
                              <span className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 border border-indigo-200">
                                DMARC
                              </span>
                            )}
                            {!log.spfResult && !log.dkimResult && !log.dmarcResult && (
                              <span className="text-slate-400">-</span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* 7. 관리 액션 (실패 메일에 한해 재발송 및 EML 다운로드 제공) */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap print:hidden">
                        {isFailed ? (
                          <div className="flex items-center justify-center gap-1.5">
                            {isOutbound && (
                              <button
                                onClick={() => handleRetry(log)}
                                disabled={retryingId === log.id}
                                className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-rose-50 px-2 py-1 text-xs font-bold text-rose-700 shadow-xs hover:bg-rose-100 transition disabled:opacity-50"
                                title="외부 메일 서버로 재발송 시도"
                              >
                                <RotateCw className={`h-3 w-3 ${retryingId === log.id ? 'animate-spin' : ''}`} />
                                <span>재발송</span>
                              </button>
                            )}

                            <a
                              href={`/api/mails/${log.id}/raw`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 shadow-xs hover:bg-slate-50 transition"
                              title="오류 원인 분석용 원본 EML 다운로드"
                            >
                              <FileDown className="h-3 w-3 text-rose-600" />
                              <span>EML</span>
                            </a>
                          </div>
                        ) : (
                          <span className="text-slate-300 select-none">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 하단 페이징 및 카운트 바 */}
        <div className="px-5 py-3.5 border-t border-slate-100 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-slate-500 print:hidden">
          <div>
            총 <span className="font-semibold text-slate-800">{filteredLogs.length}</span>건 중{' '}
            <span className="font-semibold text-slate-800">
              {displayStart} - {displayEnd}
            </span>
            건 표시
          </div>

          {paginatedLogs.length > 0 && (
            <div className="flex items-center gap-1 self-end sm:self-auto">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition"
                title="이전 페이지"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>

              {Array.from({ length: totalPages }).map((_, i) => {
                const p = i + 1;
                const isActive = p === currentPage;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPage(p)}
                    className={`h-7 w-7 rounded-lg text-xs font-semibold transition ${
                      isActive
                        ? 'bg-sky-600 text-white shadow-xs'
                        : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {p}
                  </button>
                );
              })}

              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition"
                title="다음 페이지"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 발송/처리 실패 상세 원인 확인 모달 */}
      {failureModalMail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-rose-50/50 px-6 py-4">
              <div className="flex items-center gap-2 text-rose-700">
                <AlertCircle className="h-5 w-5 text-rose-600" />
                <h3 className="font-bold text-sm">메일 발송 실패 상세 내역</h3>
              </div>
              <button
                onClick={() => setFailureModalMail(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* 모달 본문 */}
            <div className="p-6 space-y-4 text-xs text-slate-700">
              <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div className="text-slate-400">메시지 ID</div>
                <div className="col-span-2 font-mono font-medium text-slate-800 break-all">
                  {failureModalMail.id}
                </div>

                <div className="text-slate-400">발신자</div>
                <div className="col-span-2 font-medium text-slate-800">
                  {failureModalMail.sender}
                </div>

                <div className="text-slate-400">수신자</div>
                <div className="col-span-2 font-medium text-slate-800 break-all">
                  {(failureModalMail.recipients || []).map((r) => r.address).join(', ') || '(없음)'}
                </div>

                <div className="text-slate-400">제목</div>
                <div className="col-span-2 font-semibold text-slate-900">
                  {failureModalMail.subject || '(제목 없음)'}
                </div>

                <div className="text-slate-400">발생 시각</div>
                <div className="col-span-2 text-slate-600">
                  {new Date(failureModalMail.createdAt).toLocaleString()}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-slate-800 flex items-center gap-1">
                    <Info className="h-3.5 w-3.5 text-rose-600" />
                    <span>실패 원인 및 MTA 에러 로그</span>
                  </span>
                  {failureModalMail.failureReason && (
                    <button
                      onClick={async () => {
                        await navigator.clipboard.writeText(failureModalMail.failureReason || '');
                        setCopiedReason(true);
                        setTimeout(() => setCopiedReason(false), 2000);
                      }}
                      className="inline-flex items-center gap-1 text-[11px] text-sky-600 hover:underline"
                    >
                      {copiedReason ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      <span>{copiedReason ? '복사됨' : '로그 복사'}</span>
                    </button>
                  )}
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900 text-rose-300 font-mono text-[11px] leading-relaxed break-all max-h-48 overflow-y-auto border border-slate-800">
                  {failureModalMail.failureReason || '상세 에러 로그가 기록되지 않았습니다.'}
                </div>
              </div>
            </div>

            {/* 모달 푸터 */}
            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-6 py-3.5">
              <a
                href={`/api/mails/${failureModalMail.id}/raw`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition"
                title="오류 원인 분석용 원본 EML 다운로드"
              >
                <FileDown className="h-3.5 w-3.5 text-rose-600" />
                <span>오류 분석용 EML 다운로드</span>
              </a>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFailureModalMail(null)}
                  className="btn btn-sm btn-secondary text-xs"
                >
                  닫기
                </button>

                {failureModalMail.direction === 'OUTBOUND' && (
                  <button
                    type="button"
                    onClick={() => handleRetry(failureModalMail)}
                    disabled={retryingId === failureModalMail.id}
                    className="btn btn-sm btn-primary inline-flex items-center gap-1.5 text-xs bg-rose-600 hover:bg-rose-700 text-white border-rose-600 font-bold"
                  >
                    <RotateCw className={`h-3.5 w-3.5 ${retryingId === failureModalMail.id ? 'animate-spin' : ''}`} />
                    <span>지금 재발송 시도</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
