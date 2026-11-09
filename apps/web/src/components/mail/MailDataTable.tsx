'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MailMessageDto, MailFolderDto, FolderType } from '@lemail/shared-types';
import { fetchApi } from '@/lib/api';
import { SearchInput, TableUtilityButtons } from '@/components/common';
import {
  Search,
  Copy,
  FileSpreadsheet,
  Printer,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
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
  Folder,
  FolderInput,
  Inbox,
  FileEdit,
} from 'lucide-react';

export interface MailDataTableProps {
  mails: MailMessageDto[];
  total: number;
  loading: boolean;
  type?: 'inbox' | 'sent' | 'drafts' | 'spam' | 'trash' | 'folder';
  folderId?: string;
  folderName?: string;
  search: string;
  onSearchChange: (value: string) => void;
  onDelete?: (e: React.MouseEvent, mailId: string) => void;
  onToggleRead?: (e: React.MouseEvent, mailId: string, currentIsRead: boolean) => void;
  onBulkDelete?: (mailIds: string[]) => Promise<void>;
  onBulkPermanentDelete?: (mailIds: string[]) => Promise<void>;
  onBulkMove?: (mailIds: string[], targetFolderId: string) => Promise<void>;
  onBulkToggleRead?: (mailIds: string[], targetIsRead: boolean) => Promise<void>;
  onRefresh?: () => void | Promise<void>;
  emptyMessage?: string;
  emptySubMessage?: string;
}

export const MailDataTable: React.FC<MailDataTableProps> = ({
  mails,
  total,
  loading,
  type = 'inbox',
  folderId,
  folderName,
  search,
  onSearchChange,
  onDelete,
  onToggleRead,
  onBulkDelete,
  onBulkPermanentDelete,
  onBulkMove,
  onBulkToggleRead,
  onRefresh,
  emptyMessage = '메일이 없습니다.',
  emptySubMessage,
}) => {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [folders, setFolders] = useState<MailFolderDto[]>([]);
  const [isMoveOpen, setIsMoveOpen] = useState(false);
  const moveMenuRef = useRef<HTMLDivElement>(null);

  const fetchFolders = async () => {
    try {
      const res = await fetchApi<MailFolderDto[]>('/mail-folders');
      setFolders(res || []);
    } catch (err) {
      console.error('편지함 목록 조회 실패:', err);
    }
  };

  useEffect(() => {
    fetchFolders();
    const handleRefresh = () => {
      fetchFolders();
    };
    window.addEventListener('mail:refresh-folders', handleRefresh);
    return () => {
      window.removeEventListener('mail:refresh-folders', handleRefresh);
    };
  }, []);

  useEffect(() => {
    if (!isMoveOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (moveMenuRef.current && !moveMenuRef.current.contains(e.target as Node)) {
        setIsMoveOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMoveOpen]);

  interface FlatFolderItem extends MailFolderDto {
    depth: number;
  }

  const flattenedFolders = useMemo(() => {
    const list: FlatFolderItem[] = [];
    const walk = (nodes: MailFolderDto[], depth = 0) => {
      for (const node of nodes) {
        list.push({ ...node, depth });
        if (node.children && node.children.length > 0) {
          walk(node.children, depth + 1);
        }
      }
    };
    walk(folders);
    return list;
  }, [folders]);

  const isCurrentFolder = (f: MailFolderDto) => {
    if (folderId && f.id === folderId) return true;
    if (type === 'inbox' && f.type === FolderType.INBOX) return true;
    if (type === 'sent' && f.type === FolderType.SENT) return true;
    if (type === 'drafts' && f.type === FolderType.DRAFTS) return true;
    if (type === 'spam' && f.type === FolderType.SPAM) return true;
    if (type === 'trash' && f.type === FolderType.TRASH) return true;
    return false;
  };

  const getFolderIcon = (folderType: FolderType) => {
    switch (folderType) {
      case FolderType.INBOX:
        return <Inbox className="h-3.5 w-3.5 text-sky-600 shrink-0" />;
      case FolderType.SENT:
        return <Send className="h-3.5 w-3.5 text-sky-600 shrink-0" />;
      case FolderType.DRAFTS:
        return <FileEdit className="h-3.5 w-3.5 text-amber-600 shrink-0" />;
      case FolderType.SPAM:
        return <ShieldAlert className="h-3.5 w-3.5 text-rose-500 shrink-0" />;
      case FolderType.TRASH:
        return <Trash2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />;
      case FolderType.CUSTOM:
      default:
        return <Folder className="h-3.5 w-3.5 text-amber-500 shrink-0" />;
    }
  };

  const handleBulkMove = async (targetFolder: MailFolderDto) => {
    if (selectedIds.length === 0) return;
    setIsMoveOpen(false);
    try {
      if (onBulkMove) {
        await onBulkMove(selectedIds, targetFolder.id);
      } else {
        await fetchApi('/mails/bulk-move', {
          method: 'POST',
          body: JSON.stringify({
            ids: selectedIds,
            targetFolderId: targetFolder.id,
          }),
        });
      }
      const count = selectedIds.length;
      setSelectedIds([]);
      window.dispatchEvent(new CustomEvent('mail:refresh-folders'));
      if (onRefresh) {
        await onRefresh();
      }
      alert(`${count}개의 메일을 [${targetFolder.name}] 편지함으로 이동했습니다.`);
    } catch (err: any) {
      alert(err.message || '편지함 이동 실패');
    }
  };

  const handleBulkPermanentDelete = async () => {
    if (selectedIds.length === 0) return;
    if (
      !confirm(
        `선택한 ${selectedIds.length}개의 메일을 휴지통으로 이동하지 않고 영구히 완전히 삭제하시겠습니까?\n삭제된 메일은 복구할 수 없습니다.`,
      )
    ) {
      return;
    }
    try {
      if (onBulkPermanentDelete) {
        await onBulkPermanentDelete(selectedIds);
      } else {
        await fetchApi('/mails/bulk-delete', {
          method: 'POST',
          body: JSON.stringify({
            ids: selectedIds,
            permanent: true,
            folderId,
          }),
        });
      }
      setSelectedIds([]);
      window.dispatchEvent(new CustomEvent('mail:refresh-folders'));
      if (onRefresh) {
        await onRefresh();
      }
    } catch (err: any) {
      alert(err.message || '완전 삭제 실패');
    }
  };

  const handleBulkDeleteAction = async () => {
    if (selectedIds.length === 0) return;
    if (onBulkDelete) {
      await onBulkDelete(selectedIds);
      setSelectedIds([]);
    } else {
      if (!confirm(`선택한 ${selectedIds.length}개의 메일을 삭제하시겠습니까?`)) return;
      try {
        await fetchApi('/mails/bulk-delete', {
          method: 'POST',
          body: JSON.stringify({
            ids: selectedIds,
            permanent: false,
            folderId,
          }),
        });
        setSelectedIds([]);
        window.dispatchEvent(new CustomEvent('mail:refresh-folders'));
        if (onRefresh) {
          await onRefresh();
        }
      } catch (err: any) {
        alert(err.message || '메일 삭제 실패');
      }
    }
  };

  const handleBulkReadAction = async () => {
    if (selectedIds.length === 0) return;
    if (onBulkToggleRead) {
      await onBulkToggleRead(selectedIds, true);
    } else {
      try {
        await Promise.all(
          selectedIds.map((id) =>
            fetchApi(`/mails/${id}/read`, {
              method: 'PATCH',
              body: JSON.stringify({ isRead: true, folderId }),
            }),
          ),
        );
        window.dispatchEvent(new CustomEvent('mail:refresh-folders'));
        if (onRefresh) {
          await onRefresh();
        }
      } catch (err: any) {
        alert(err.message || '읽음 처리 실패');
      }
    }
  };

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
    const match = senderOrRecipients.match(/^(.*?)(?:<(.+?)>)?$/);
    if (match) {
      const name = match[1].trim() || match[2] || senderOrRecipients;
      const address = match[2] || (match[1].includes('@') ? match[1].trim() : '');
      return { name, address };
    }
    return { name: senderOrRecipients, address: '' };
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden transition printable-area">
      {/* 1. 상단 툴바: 검색창 (좌) + 다중선택 액션군 + Copy / Excel / Print 버튼 (우) */}
      <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white print-toolbar">
        {/* 검색창 */}
        <div className="w-full sm:w-64">
          <SearchInput
            value={search}
            onChange={onSearchChange}
            placeholder="사원명, 사번, 부서, 제목 검색..."
            size="md"
          />
        </div>

        {/* 우측 유틸리티 버튼군 */}
        <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap sm:flex-nowrap">
          {/* 다중 선택 일괄 액션 (선택되었을 때만 표시) */}
          {selectedIds.length > 0 && (
            <div className="flex items-center gap-1.5 mr-1 pr-2 border-r border-slate-200">
              <span className="text-xs font-semibold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-lg border border-sky-200">
                {selectedIds.length}개 선택
              </span>

              {/* 읽음 버튼 */}
              <button
                type="button"
                onClick={handleBulkReadAction}
                className="btn btn-sm btn-secondary text-xs font-medium"
              >
                읽음
              </button>

              {/* 이동 버튼 + 드롭다운 */}
              <div className="relative" ref={moveMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsMoveOpen((prev) => !prev)}
                  className="btn btn-sm btn-secondary text-xs font-medium inline-flex items-center gap-1"
                  title="선택한 메일을 다른 편지함으로 이동"
                >
                  <FolderInput className="w-3.5 h-3.5 text-slate-500" />
                  <span>이동</span>
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </button>

                {isMoveOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-60 rounded-xl border border-slate-200 bg-white py-1.5 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-3 py-1.5 border-b border-slate-100 text-[11px] font-semibold text-slate-400 flex items-center justify-between">
                      <span>이동할 편지함 선택</span>
                      <span className="text-[10px] text-slate-400 font-normal">
                        {flattenedFolders.length}개 폴더
                      </span>
                    </div>
                    <div className="max-h-60 overflow-y-auto py-1 divide-y divide-slate-50">
                      {flattenedFolders.length === 0 ? (
                        <div className="px-4 py-3 text-center text-xs text-slate-400">
                          편지함을 불러오는 중...
                        </div>
                      ) : (
                        flattenedFolders.map((f) => {
                          const isCurrent = isCurrentFolder(f);
                          return (
                            <button
                              key={f.id}
                              type="button"
                              disabled={isCurrent}
                              onClick={() => handleBulkMove(f)}
                              style={{ paddingLeft: `${f.depth * 14 + 12}px` }}
                              className={`w-full pr-3 py-1.5 text-left text-xs flex items-center justify-between transition ${
                                isCurrent
                                  ? 'text-slate-300 cursor-not-allowed bg-slate-50/50'
                                  : 'text-slate-700 hover:bg-sky-50 hover:text-sky-800'
                              }`}
                            >
                              <span className="flex items-center gap-2 truncate">
                                {getFolderIcon(f.type)}
                                <span className={`truncate ${isCurrent ? 'text-slate-400' : ''}`}>
                                  {f.name}
                                </span>
                              </span>
                              {isCurrent && (
                                <span className="text-[10px] text-slate-400 font-normal shrink-0 ml-1">
                                  (현재)
                                </span>
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 삭제 버튼 (기본: 휴지통 이동) */}
              <button
                type="button"
                onClick={handleBulkDeleteAction}
                className="btn btn-sm btn-secondary text-xs font-medium text-rose-600 hover:text-rose-700 border-rose-200 hover:border-rose-300 bg-rose-50/50"
                title={type === 'trash' ? '휴지통에서 삭제' : '휴지통으로 이동'}
              >
                삭제
              </button>

              {/* 완전삭제 버튼 (휴지통으로 이동하지 않고 바로 삭제) */}
              <button
                type="button"
                onClick={handleBulkPermanentDelete}
                className="btn btn-sm btn-danger text-xs font-medium inline-flex items-center gap-1"
                title="휴지통으로 이동하지 않고 즉시 영구 삭제"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>완전삭제</span>
              </button>
            </div>
          )}

          {/* Table Utility 3종 버튼 (Copy, Excel, Print) */}
          <TableUtilityButtons
            onCopy={handleCopy}
            onExcel={handleExcelExport}
            onPrint={handlePrint}
            copied={copied}
          />
        </div>
      </div>

      {/* 2. 데이터 테이블 영역 */}
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
              <th className="w-56 px-4 py-3 whitespace-nowrap">
                {isSent ? '수신 정보' : '사원 정보'}
              </th>
              <th className="w-24 px-4 py-3 text-center whitespace-nowrap">상태</th>
              <th className="px-4 py-3 whitespace-nowrap">제목</th>
              <th className="w-24 px-4 py-3 whitespace-nowrap text-center">
                {isSent ? '발송 시각' : '수신 시각'}
              </th>
              <th className="w-48 px-4 py-3 whitespace-nowrap">비고</th>
              <th className="w-20 px-4 py-3 text-right whitespace-nowrap">관리</th>
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

                    {/* 3. 상태 뱃지 */}
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

      {/* 3. 하단 페이징 및 카운트 바 */}
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
                      ? 'bg-sky-600 text-white shadow-xs'
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
