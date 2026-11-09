'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { fetchApi } from '@/lib/api';
import { MailMessageDto } from '@lemail/shared-types';
import { PageHeader, SearchInput, TableUtilityButtons } from '@/components/common';
import {
  Layers,
  ShieldCheck,
  Download,
  Search,
  RefreshCw,
  FileText,
  Copy,
  FileSpreadsheet,
  Printer,
  Check,
  ChevronLeft,
  ChevronRight,
  User,
  CheckCircle2,
  AlertCircle,
  FileDown,
} from 'lucide-react';

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<MailMessageDto[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'PROCESSED' | 'FAILED' | 'QUEUED'>('all');
  const [loading, setLoading] = useState(true);

  // Selection & Pagination
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const loadLogs = async () => {
    try {
      setLoading(true);
      const res = await fetchApi<{ items: MailMessageDto[]; total: number }>(
        `/mails?search=${encodeURIComponent(search)}&limit=100`,
      );
      setLogs(res.items || []);
      setTotal(res.total || 0);
      setSelectedIds([]);
      setPage(1);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [search]);

  // 필터링 적용
  const filteredLogs = useMemo(() => {
    if (statusFilter === 'all') return logs;
    return logs.filter((log) => log.status === statusFilter);
  }, [logs, statusFilter]);

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

  // 클립보드 복사
  const handleCopy = async () => {
    const targets =
      selectedIds.length > 0
        ? filteredLogs.filter((m) => selectedIds.includes(m.id))
        : paginatedLogs;

    if (targets.length === 0) return;

    const header = ['일자', '발신자', '상태', '제목', '시각', '보안인증 (SPF/DKIM/DMARC)'].join('\t');
    const rows = targets.map((m) => {
      const date = new Date(m.createdAt);
      const dateStr = date.toISOString().slice(0, 10);
      const timeStr = date.toTimeString().slice(0, 8);
      const authInfo = [
        m.spfResult ? `SPF:${m.spfResult}` : '',
        m.dkimResult ? `DKIM:${m.dkimResult}` : '',
        m.dmarcResult ? `DMARC:${m.dmarcResult}` : '',
      ]
        .filter(Boolean)
        .join(' ');
      return [
        dateStr,
        m.sender,
        m.status,
        m.subject || '(제목 없음)',
        timeStr,
        authInfo,
      ].join('\t');
    });

    const text = [header, ...rows].join('\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Excel CSV 다운로드
  const handleExcelExport = () => {
    const targets =
      selectedIds.length > 0
        ? filteredLogs.filter((m) => selectedIds.includes(m.id))
        : filteredLogs;

    if (targets.length === 0) {
      alert('내보낼 로그 데이터가 없습니다.');
      return;
    }

    const header = ['일자', '발신자', '상태', '제목', '시각', '보안인증 (SPF/DKIM/DMARC)', '메시지ID'];
    const escapeCsv = (val: string) => `"${(val || '').replace(/"/g, '""')}"`;

    const rows = targets.map((m) => {
      const date = new Date(m.createdAt);
      const dateStr = date.toISOString().slice(0, 10);
      const timeStr = date.toTimeString().slice(0, 8);
      const authInfo = [
        m.spfResult ? `SPF:${m.spfResult}` : '',
        m.dkimResult ? `DKIM:${m.dkimResult}` : '',
        m.dmarcResult ? `DMARC:${m.dmarcResult}` : '',
      ]
        .filter(Boolean)
        .join(' ');

      return [
        escapeCsv(dateStr),
        escapeCsv(m.sender),
        escapeCsv(m.status),
        escapeCsv(m.subject || '(제목 없음)'),
        escapeCsv(timeStr),
        escapeCsv(authInfo),
        escapeCsv(m.id),
      ].join(',');
    });

    const csvContent = '\uFEFF' + [header.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const today = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.setAttribute('download', `LEMail_AuditLogs_${today}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 인쇄
  const handlePrint = () => {
    window.print();
  };

  // 날짜 파서
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

  // 발신자 문자열 분리
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
        title="수신 및 보안 감사 로그"
        icon={<Layers className="h-6 w-6 text-sky-600" />}
        subtitle="인바운드 메일의 보안 인증(SPF, DKIM, DMARC) 및 원본 EML 처리 기록을 검사합니다."
        action={
          <button
            onClick={loadLogs}
            disabled={loading}
            className="btn btn-sm btn-secondary inline-flex items-center gap-1.5 text-xs font-semibold"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            <span>새로고침</span>
          </button>
        }
      />

      {/* Main Table Container */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden transition printable-area">
        {/* 상단 툴바: 상태 필터 -> 검색창 / 버튼군 */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white print-toolbar">
          {/* 좌측: [상태 필터] -> [검색창] (ams 표준 순서 준수) */}
          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none transition focus:border-sky-500 shadow-xs"
            >
              <option value="all">모든 상태</option>
              <option value="PROCESSED">PROCESSED (정상 처리)</option>
              <option value="QUEUED">QUEUED (대기 중)</option>
              <option value="FAILED">FAILED (처리 실패)</option>
            </select>

            <div className="w-60">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="발신자, 제목 검색..."
                size="md"
              />
            </div>
          </div>

          {/* 우측: 유틸리티 버튼군 */}
          <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
            {/* 다중 선택 일괄 뱃지 */}
            {selectedIds.length > 0 && (
              <div className="flex items-center gap-1.5 mr-1 pr-2 border-r border-slate-200">
                <span className="text-xs font-semibold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-lg border border-sky-200">
                  {selectedIds.length}개 선택
                </span>
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
            {/* 테이블 헤더 */}
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50 text-slate-600 font-medium select-none">
                <th className="w-10 px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={allCurrentSelected}
                    onChange={handleSelectAll}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                    title="전체 선택"
                  />
                </th>
                <th className="w-28 px-4 py-3 whitespace-nowrap">일자</th>
                <th className="w-56 px-4 py-3 whitespace-nowrap">발신 정보</th>
                <th className="w-28 px-4 py-3 text-center whitespace-nowrap">처리 상태</th>
                <th className="px-4 py-3 whitespace-nowrap">제목</th>
                <th className="w-24 px-4 py-3 text-center whitespace-nowrap">수신 시각</th>
                <th className="w-48 px-4 py-3 whitespace-nowrap">보안 인증</th>
                <th className="w-24 px-4 py-3 text-right whitespace-nowrap">EML 파일</th>
              </tr>
            </thead>

            {/* 테이블 본문 */}
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
                      <p className="text-xs text-slate-400 mt-1">인바운드 메일이 수신되면 자동으로 감사 로그가 기록됩니다.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedLogs.map((log) => {
                  const isSelected = selectedIds.includes(log.id);
                  const { dateStr, timeStr } = formatDateParts(log.createdAt);
                  const { name, address } = extractPersonInfo(log.sender);

                  return (
                    <tr
                      key={log.id}
                      className={`transition-colors duration-100 hover:bg-slate-50/80 ${
                        isSelected ? 'bg-sky-50/40' : 'bg-white'
                      }`}
                    >
                      {/* 선택 체크박스 */}
                      <td
                        className="px-4 py-3.5 text-center"
                        onClick={(e) => handleToggleSelect(log.id, e)}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                        />
                      </td>

                      {/* 1. 일자 */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-slate-600 font-mono">
                        {dateStr}
                      </td>

                      {/* 2. 발신 정보 (아바타 + 이름/주소) */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                            {name ? name.slice(0, 1).toUpperCase() : <User className="h-3.5 w-3.5" />}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 truncate max-w-[180px]">
                              {name}
                            </div>
                            {address && (
                              <div className="text-[11px] text-slate-400 truncate max-w-[180px]">
                                {address}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 3. 처리 상태 */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        {log.status === 'PROCESSED' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                            <span>정상 처리</span>
                          </span>
                        ) : log.status === 'FAILED' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700 border border-rose-200">
                            <AlertCircle className="h-3 w-3 text-rose-600" />
                            <span>처리 실패</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-700 border border-amber-200">
                            대기 중 ({log.status})
                          </span>
                        )}
                      </td>

                      {/* 4. 제목 */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="truncate max-w-md font-medium text-slate-900">
                            {log.subject || '(제목 없음)'}
                          </span>
                          <span
                            className="font-mono text-[10px] text-slate-400 truncate max-w-[100px]"
                            title={log.id}
                          >
                            #{log.id.slice(0, 6)}
                          </span>
                        </div>
                      </td>

                      {/* 5. 수신 시각 */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap text-slate-600 font-mono">
                        {timeStr}
                      </td>

                      {/* 6. 보안 인증 뱃지군 */}
                      <td className="px-4 py-3.5 text-slate-500 whitespace-nowrap text-[11px]">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {log.spfResult === 'PASS' && (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                              SPF 통과
                            </span>
                          )}
                          {log.dkimResult === 'PASS' && (
                            <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700 border border-sky-200">
                              DKIM 통과
                            </span>
                          )}
                          {log.dmarcResult === 'PASS' && (
                            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 border border-indigo-200">
                              DMARC 통과
                            </span>
                          )}
                          {log.spfResult && log.spfResult !== 'PASS' && (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200">
                              SPF: {log.spfResult}
                            </span>
                          )}
                          {!log.spfResult && !log.dkimResult && !log.dmarcResult && (
                            <span className="text-slate-400">-</span>
                          )}
                        </div>
                      </td>

                      {/* 7. EML 다운로드 */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <a
                          href={`/api/mails/${log.id}/raw`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-sky-600 shadow-sm hover:bg-sky-50 hover:border-sky-300 transition"
                          title="원본 EML 파일 다운로드"
                        >
                          <FileDown className="h-3.5 w-3.5" />
                          <span>EML</span>
                        </a>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 하단 페이징 및 카운트 바 */}
        <div className="px-5 py-3.5 border-t border-slate-100 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-slate-500">
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
                        ? 'bg-indigo-600 text-white shadow-sm'
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
    </div>
  );
}
