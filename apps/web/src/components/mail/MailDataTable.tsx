'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MailMessageDto } from '@lemail/shared-types';
import { fetchApi } from '@/lib/api';
import {
  Search,
  Copy,
  FileSpreadsheet,
  Printer,
  Check,
  ChevronLeft,
  ChevronRight,
  Paperclip,
  Trash2,
  Mail,
  MailOpen,
  MailCheck,
  User,
  ShieldCheck,
  ShieldAlert,
  Send,
  RefreshCw,
} from 'lucide-react';

export interface MailDataTableProps {
  mails: MailMessageDto[];
  total: number;
  loading: boolean;
  type?: 'inbox' | 'sent' | 'drafts' | 'spam' | 'trash' | 'folder';
  folderName?: string;
  search: string;
  onSearchChange: (value: string) => void;
  onDelete?: (e: React.MouseEvent, mailId: string) => void;
  onToggleRead?: (e: React.MouseEvent, mailId: string, currentIsRead: boolean) => void;
  onBulkDelete?: (mailIds: string[]) => Promise<void>;
  onBulkToggleRead?: (mailIds: string[], targetIsRead: boolean) => Promise<void>;
  emptyMessage?: string;
  emptySubMessage?: string;
}

export const MailDataTable: React.FC<MailDataTableProps> = ({
  mails,
  total,
  loading,
  type = 'inbox',
  folderName,
  search,
  onSearchChange,
  onDelete,
  onToggleRead,
  onBulkDelete,
  onBulkToggleRead,
  emptyMessage = '메일이 없습니다.',
  emptySubMessage,
}) => {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const isSent = type === 'sent';
  const isSpam = type === 'spam';
  const isTrash = type === 'trash';
  const isDraft = type === 'drafts';

  // Client-side pagination slice if all fetched at once
  const totalPages = Math.max(1, Math.ceil(mails.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedMails = mails.slice(startIndex, startIndex + pageSize);

  const displayStart = mails.length === 0 ? 0 : startIndex + 1;
  const displayEnd = Math.min(startIndex + pageSize, mails.length);

  // Checkbox handlers
  const allCurrentSelected =
    paginatedMails.length > 0 && paginatedMails.every((m) => selectedIds.includes(m.id));

  const handleSelectAll = () => {
    if (allCurrentSelected) {
      setSelectedIds((prev) => prev.filter((id) => !paginatedMails.some((m) => m.id === id)));
    } else {
      const toAdd = paginatedMails.map((m) => m.id);
      setSelectedIds((prev) => Array.from(new Set([...prev, ...toAdd])));
    }
  };

  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Row navigation & Auto Read
  const handleRowClick = (mail: MailMessageDto) => {
    if (isDraft) {
      router.push(`/mail/compose?draftId=${mail.id}`);
      return;
    }
    if (!mail.isRead) {
      fetchApi(`/mails/${mail.id}/read`, {
        method: 'PATCH',
        body: JSON.stringify({ isRead: true }),
      }).catch((err) => console.error('Auto mark read error:', err));
      window.dispatchEvent(new CustomEvent('mail:refresh-folders'));
    }
    router.push(`/mail/${mail.id}`);
  };

  // Copy Action
  const handleCopy = async () => {
    const targetMails =
      selectedIds.length > 0
        ? mails.filter((m) => selectedIds.includes(m.id))
        : paginatedMails;

    if (targetMails.length === 0) return;

    const header = ['일자', isSent ? '수신자' : '발신자', '상태', '제목', '시각', '비고'].join(
      '\t'
    );
    const rows = targetMails.map((m) => {
      const date = new Date(m.createdAt);
      const dateStr = date.toISOString().slice(0, 10);
      const timeStr = date.toTimeString().slice(0, 8);
      const person = isSent
        ? m.recipients?.map((r) => r.address).join(', ') || '(수신자 없음)'
        : m.sender;
      const status = m.isRead ? '읽음' : '안읽음';
      const remark = [
        m.spfResult ? `SPF:${m.spfResult}` : '',
        m.dkimResult ? `DKIM:${m.dkimResult}` : '',
      ]
        .filter(Boolean)
        .join(' ');
      return [dateStr, person, status, m.subject || '(제목 없음)', timeStr, remark].join('\t');
    });

    const textToCopy = [header, ...rows].join('\n');
    await navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Excel (CSV with UTF-8 BOM) Export
  const handleExcelExport = () => {
    const targetMails =
      selectedIds.length > 0
        ? mails.filter((m) => selectedIds.includes(m.id))
        : mails;

    if (targetMails.length === 0) {
      alert('내보낼 메일 데이터가 없습니다.');
      return;
    }

    const header = ['일자', isSent ? '수신자' : '발신자', '상태', '제목', '시각', '비고'];
    const escapeCsv = (val: string) => `"${(val || '').replace(/"/g, '""')}"`;

    const rows = targetMails.map((m) => {
      const date = new Date(m.createdAt);
      const dateStr = date.toISOString().slice(0, 10);
      const timeStr = date.toTimeString().slice(0, 8);
      const person = isSent
        ? m.recipients?.map((r) => r.address).join(', ') || '(수신자 없음)'
        : m.sender;
      const status = isSpam
        ? '스팸'
        : m.isRead
        ? '읽음'
        : '안읽음';
      const remark = [
        m.spfResult ? `SPF:${m.spfResult}` : '',
        m.dkimResult ? `DKIM:${m.dkimResult}` : '',
        m.dmarcResult ? `DMARC:${m.dmarcResult}` : '',
      ]
        .filter(Boolean)
        .join(' ');

      return [
        escapeCsv(dateStr),
        escapeCsv(person),
        escapeCsv(status),
        escapeCsv(m.subject || '(제목 없음)'),
        escapeCsv(timeStr),
        escapeCsv(remark),
      ].join(',');
    });

    const csvContent = '\uFEFF' + [header.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const today = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.setAttribute('download', `LEMail_${type}_${today}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Print Action
  const handlePrint = () => {
    window.print();
  };

  // Helper date formatter
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

  // Extract display name or local part from email
  const extractPersonInfo = (senderOrRecipients: string) => {
    if (!senderOrRecipients) return { name: '(없음)', address: '' };
    // Example: "홍길동 <hong@example.com>" or "hong@example.com"
    const match = senderOrRecipients.match(/^(.*?)(?:<(.+?)>)?$/);
    if (match) {
      const name = match[1].trim() || match[2] || senderOrRecipients;
      const address = match[2] || (match[1].includes('@') ? match[1].trim() : '');
      return { name, address };
    }
    return { name: senderOrRecipients, address: '' };
  };

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white shadow-sm overflow-hidden transition">
      {/* 1. 상단 툴바: 검색창 (좌) + Copy / Excel / Print 버튼 (우) */}
      <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white">
        {/* 검색창 */}
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="사원명, 사번, 부서, 제목 검색..."
            className="h-9 w-full rounded-xl border border-slate-200/90 bg-slate-50/70 pl-9 pr-4 text-xs font-normal outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:bg-white focus:ring-2 focus:ring-sky-100"
          />
        </div>

        {/* 우측 유틸리티 버튼군 (Copy, Excel, Print) */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          {/* 다중 선택 일괄 액션 (선택되었을 때만 표시) */}
          {selectedIds.length > 0 && (
            <div className="flex items-center gap-1.5 mr-2 pr-2 border-r border-slate-200">
              <span className="text-xs font-semibold text-sky-600 bg-sky-50 px-2 py-0.5 rounded-lg border border-sky-200">
                {selectedIds.length}개 선택
              </span>
              {onBulkToggleRead && (
                <button
                  type="button"
                  onClick={() => onBulkToggleRead(selectedIds, true)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition"
                >
                  읽음
                </button>
              )}
              {onBulkDelete && (
                <button
                  type="button"
                  onClick={() => onBulkDelete(selectedIds)}
                  className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-medium text-rose-700 shadow-sm hover:bg-rose-100 transition"
                >
                  삭제
                </button>
              )}
            </div>
          )}

          {/* Copy 버튼 */}
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:border-slate-300 active:scale-95"
            title="현재 목록 클립보드 복사"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-emerald-700 font-bold">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 text-slate-500" />
                <span>Copy</span>
              </>
            )}
          </button>

          {/* Excel 버튼 */}
          <button
            type="button"
            onClick={handleExcelExport}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:border-slate-300 active:scale-95"
            title="CSV/Excel 파일로 다운로드"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
            <span>Excel</span>
          </button>

          {/* Print 버튼 */}
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:border-slate-300 active:scale-95"
            title="인쇄 미리보기"
          >
            <Printer className="h-3.5 w-3.5 text-slate-500" />
            <span>Print</span>
          </button>
        </div>
      </div>

      {/* 2. 데이터 테이블 영역 */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          {/* 테이블 헤더 */}
          <thead>
            <tr className="border-b border-slate-200/80 bg-slate-50/60 text-slate-600 font-semibold select-none">
              <th className="w-10 px-4 py-3.5 text-center">
                <input
                  type="checkbox"
                  checked={allCurrentSelected}
                  onChange={handleSelectAll}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                  title="전체 선택"
                />
              </th>
              <th className="w-28 px-4 py-3.5 whitespace-nowrap">일자</th>
              <th className="w-56 px-4 py-3.5 whitespace-nowrap">
                {isSent ? '수신 정보' : '사원 정보'}
              </th>
              <th className="w-24 px-4 py-3.5 text-center whitespace-nowrap">상태</th>
              <th className="px-4 py-3.5 whitespace-nowrap">제목</th>
              <th className="w-24 px-4 py-3.5 whitespace-nowrap text-center">
                {isSent ? '발송 시각' : '수신 시각'}
              </th>
              <th className="w-48 px-4 py-3.5 whitespace-nowrap">비고</th>
              <th className="w-20 px-4 py-3.5 text-right whitespace-nowrap">관리</th>
            </tr>
          </thead>

          {/* 테이블 본문 */}
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {loading ? (
              <tr>
                <td colSpan={8} className="py-16 text-center text-slate-400">
                  <div className="flex items-center justify-center gap-2">
                    <RefreshCw className="h-5 w-5 animate-spin text-sky-600" />
                    <span className="font-medium">메일 목록을 불러오는 중...</span>
                  </div>
                </td>
              </tr>
            ) : paginatedMails.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-16 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center">
                    <Mail className="h-10 w-10 text-slate-300 mb-2 stroke-1" />
                    <p className="font-semibold text-slate-600 text-sm">{emptyMessage}</p>
                    {emptySubMessage && (
                      <p className="text-xs text-slate-400 mt-1">{emptySubMessage}</p>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              paginatedMails.map((mail) => {
                const { dateStr, timeStr } = formatDateParts(mail.createdAt);
                const isRead = Boolean(mail.isRead);
                const isSelected = selectedIds.includes(mail.id);

                const personRaw = isSent
                  ? mail.recipients && mail.recipients.length > 0
                    ? mail.recipients.map((r) => r.address).join(', ')
                    : '(수신자 없음)'
                  : mail.sender;
                const { name, address } = extractPersonInfo(personRaw);

                return (
                  <tr
                    key={mail.id}
                    onClick={() => handleRowClick(mail)}
                    className={`cursor-pointer transition-colors duration-100 hover:bg-slate-50/80 ${
                      isSelected ? 'bg-sky-50/40' : !isRead ? 'bg-white font-medium' : 'bg-slate-50/20'
                    }`}
                  >
                    {/* 선택 체크박스 */}
                    <td
                      className="px-4 py-3.5 text-center"
                      onClick={(e) => handleToggleSelect(mail.id, e)}
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

                    {/* 2. 사원 정보 (발신자 / 수신자 아바타 + 이름 + 주소) */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                            !isRead
                              ? 'bg-sky-100 text-sky-700 ring-1 ring-sky-200'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {name ? name.slice(0, 1).toUpperCase() : <User className="h-3.5 w-3.5" />}
                        </div>
                        <div className="min-w-0">
                          <div
                            className={`truncate max-w-[180px] ${
                              !isRead ? 'font-bold text-slate-900' : 'font-medium text-slate-700'
                            }`}
                          >
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

                    {/* 3. 상태 뱃지 (레퍼런스의 '정상 출근' 스타일 파스텔톤 라운드 뱃지) */}
                    <td className="px-4 py-3.5 text-center whitespace-nowrap">
                      {isSpam ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700 border border-rose-200">
                          스팸 분류
                        </span>
                      ) : !isRead ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                          정상 수신
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600 border border-slate-200">
                          읽음 완료
                        </span>
                      )}
                    </td>

                    {/* 4. 제목 */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`truncate max-w-md ${
                            !isRead ? 'font-bold text-slate-950' : 'font-normal text-slate-700'
                          }`}
                        >
                          {mail.subject || '(제목 없음)'}
                        </span>
                        {mail.attachments && mail.attachments.length > 0 && (
                          <span
                            className="inline-flex items-center gap-0.5 text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 shrink-0"
                            title={`첨부파일 ${mail.attachments.length}개`}
                          >
                            <Paperclip className="h-3 w-3" />
                            <span>{mail.attachments.length}</span>
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 5. 수신 / 발송 시각 */}
                    <td className="px-4 py-3.5 text-center whitespace-nowrap text-slate-600 font-mono">
                      {timeStr}
                    </td>

                    {/* 6. 비고 (보안 인증 및 메타 정보) */}
                    <td className="px-4 py-3.5 text-slate-500 whitespace-nowrap text-[11px]">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {mail.spfResult === 'PASS' && (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                            SPF 통과
                          </span>
                        )}
                        {mail.dkimResult === 'PASS' && (
                          <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700 border border-sky-200">
                            DKIM 통과
                          </span>
                        )}
                        {mail.spfResult && mail.spfResult !== 'PASS' && (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200">
                            SPF: {mail.spfResult}
                          </span>
                        )}
                        {!mail.spfResult && !mail.dkimResult && (
                          <span className="text-slate-400">-</span>
                        )}
                      </div>
                    </td>

                    {/* 7. 관리 액션 버튼 */}
                    <td
                      className="px-4 py-3.5 text-right whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-1">
                        {onToggleRead && (
                          <button
                            type="button"
                            onClick={(e) => onToggleRead(e, mail.id, isRead)}
                            title={isRead ? '안읽음으로 표시' : '읽음으로 표시'}
                            className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-sky-600 transition"
                          >
                            {isRead ? (
                              <Mail className="h-3.5 w-3.5" />
                            ) : (
                              <MailCheck className="h-3.5 w-3.5 text-sky-600" />
                            )}
                          </button>
                        )}
                        {onDelete && (
                          <button
                            type="button"
                            onClick={(e) => onDelete(e, mail.id)}
                            title="삭제"
                            className="p-1 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 3. 하단 페이징 및 카운트 바 (레퍼런스 이미지의 '총 2건 중 1 - 2건 표시' + '< 1 >') */}
      <div className="px-5 py-3.5 border-t border-slate-100 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-slate-500">
        <div>
          총 <span className="font-semibold text-slate-800">{mails.length}</span>건 중{' '}
          <span className="font-semibold text-slate-800">
            {displayStart} - {displayEnd}
          </span>
          건 표시
        </div>

        {paginatedMails.length > 0 && (
          <div className="flex items-center gap-1 self-end sm:self-auto">
            {/* 이전 버튼 */}
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition"
              title="이전 페이지"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>

            {/* 번호형 페이지 버튼 */}
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

            {/* 다음 버튼 */}
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
  );
};
