'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MailMessageDto, MailFolderDto, FolderType } from '@lemail/shared-types';
import { fetchApi } from '@/lib/api';
import { SearchInput, TableUtilityButtons } from '@/components/common';
import { exportTableToExcel } from '@/lib/excel';
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
  Filter,
  Star,
  Lock,
  Reply,
  Forward,
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
  statusFilter?: string;
  onStatusFilterChange?: (filter: string) => void;
  onDelete?: (e: React.MouseEvent, mailId: string) => void;
  onToggleRead?: (e: React.MouseEvent, mailId: string, currentIsRead: boolean) => void;
  onBulkDelete?: (mailIds: string[]) => Promise<void>;
  onBulkPermanentDelete?: (mailIds: string[]) => Promise<void>;
  onBulkMove?: (mailIds: string[], targetFolderId: string) => Promise<void>;
  onBulkToggleRead?: (mailIds: string[], targetIsRead: boolean) => Promise<void>;
  onRefresh?: () => void | Promise<void>;
  emptyMessage?: string;
  emptySubMessage?: string;
  searchPlaceholder?: string;
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
  statusFilter: propsStatusFilter,
  onStatusFilterChange,
  onDelete,
  onToggleRead,
  onBulkDelete,
  onBulkPermanentDelete,
  onBulkMove,
  onBulkToggleRead,
  onRefresh,
  emptyMessage = '메일이 없습니다.',
  emptySubMessage,
  searchPlaceholder,
}) => {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [internalStatusFilter, setInternalStatusFilter] = useState('all');
  const activeStatusFilter =
    propsStatusFilter !== undefined ? propsStatusFilter : internalStatusFilter;

  const handleStatusFilterChange = (val: string) => {
    setInternalStatusFilter(val);
    setPage(1);
    if (onStatusFilterChange) {
      onStatusFilterChange(val);
    }
  };

  const [folders, setFolders] = useState<MailFolderDto[]>([]);
  const [isMoveOpen, setIsMoveOpen] = useState(false);
  const moveMenuRef = useRef<HTMLDivElement>(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const [starredOverrides, setStarredOverrides] = useState<Record<string, boolean>>({});
  const [readOverrides, setReadOverrides] = useState<Record<string, boolean>>({});

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
    if (!isMoveOpen && !isFilterOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (moveMenuRef.current && !moveMenuRef.current.contains(e.target as Node)) {
        setIsMoveOpen(false);
      }
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target as Node)) {
        setIsFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMoveOpen, isFilterOpen]);

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

  const handleBulkUnreportSpam = async () => {
    if (selectedIds.length === 0) return;
    if (
      !confirm(
        `선택한 ${selectedIds.length}개의 메일을 스팸 해제하고 받은편지함으로 복원하시겠습니까?\n(발신자가 수신 허용 목록에 등록됩니다)`,
      )
    )
      return;
    try {
      await Promise.all(
        selectedIds.map((id) =>
          fetchApi(`/mails/${id}/unreport-spam`, { method: 'POST' }),
        ),
      );
      setSelectedIds([]);
      window.dispatchEvent(new CustomEvent('mail:refresh-folders'));
      if (onRefresh) {
        await onRefresh();
      }
      alert('선택한 메일이 받은편지함으로 복원되었습니다.');
    } catch (err: any) {
      alert(err.message || '스팸 해제 실패');
    }
  };

  const handleBulkReportSpam = async () => {
    if (selectedIds.length === 0) return;
    if (
      !confirm(
        `선택한 ${selectedIds.length}개의 메일을 스팸으로 신고하시겠습니까?\n(발신자가 차단 목록에 등록되며 메일이 스팸함으로 이동합니다)`,
      )
    )
      return;
    try {
      await Promise.all(
        selectedIds.map((id) =>
          fetchApi(`/mails/${id}/report-spam`, { method: 'POST' }),
        ),
      );
      setSelectedIds([]);
      window.dispatchEvent(new CustomEvent('mail:refresh-folders'));
      if (onRefresh) {
        await onRefresh();
      }
      alert('선택한 메일이 스팸함으로 이동 및 차단 등록되었습니다.');
    } catch (err: any) {
      alert(err.message || '스팸 신고 실패');
    }
  };

  const isSent = type === 'sent';
  const isSpam = type === 'spam';
  const isTrash = type === 'trash';
  const isDraft = type === 'drafts';

  // 메일 상태 판별 헬퍼 (신규, 안읽음, 읽음, 보안, 중요, 답장, 전달)
  const getMailStatusFlags = (mail: MailMessageDto) => {
    const isRead =
      readOverrides[mail.id] !== undefined ? readOverrides[mail.id] : Boolean(mail.isRead);
    const isStarred =
      starredOverrides[mail.id] !== undefined
        ? starredOverrides[mail.id]
        : Boolean(mail.isStarred || mail.isImportant);
    const isNew =
      !isRead &&
      !isSent &&
      !isDraft &&
      (mail.isNew !== undefined ? mail.isNew : !Boolean(mail.isSeen));
    const isSecure = Boolean(
      mail.isSecure ||
        mail.subject?.includes('[보안메일]') ||
        mail.attachments?.some((a) => a.filename?.includes('[보안메일]'))
    );
    const isAnswered = Boolean(
      mail.isAnswered || (mail.subject && /^(Re:|답장:)/i.test(mail.subject.trim()))
    );
    const isForwarded = Boolean(
      mail.isForwarded || (mail.subject && /^(Fwd?:|전달:)/i.test(mail.subject.trim()))
    );

    const labels: string[] = [];
    if (isNew) labels.push('신규');
    labels.push(isRead ? '읽음' : '안읽음');
    if (isSecure) labels.push('보안');
    if (isStarred) labels.push('중요');
    if (isAnswered) labels.push('답장');
    if (isForwarded) labels.push('전달');

    return {
      isRead,
      isStarred,
      isNew,
      isSecure,
      isAnswered,
      isForwarded,
      statusText: labels.join('/'),
    };
  };

  // 중요(별표) 상태 토글 핸들러
  const handleToggleStar = async (e: React.MouseEvent, mail: MailMessageDto, currentStarred: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    const nextStarred = !currentStarred;
    setStarredOverrides((prev) => ({ ...prev, [mail.id]: nextStarred }));
    try {
      await fetchApi(`/mails/${mail.id}/star`, {
        method: 'PATCH',
        body: JSON.stringify({ isStarred: nextStarred, folderId }),
      });
      if (onRefresh) {
        await onRefresh();
      }
    } catch (err: any) {
      setStarredOverrides((prev) => ({ ...prev, [mail.id]: currentStarred }));
      alert(err.message || '중요 상태 변경 실패');
    }
  };

  // 상태 아이콘 클릭으로 읽음/안읽음 토글
  const handleStatusToggleRead = async (e: React.MouseEvent, mail: MailMessageDto, currentIsRead: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    if (onToggleRead) {
      onToggleRead(e, mail.id, currentIsRead);
      return;
    }
    const nextRead = !currentIsRead;
    setReadOverrides((prev) => ({ ...prev, [mail.id]: nextRead }));
    try {
      await fetchApi(`/mails/${mail.id}/read`, {
        method: 'PATCH',
        body: JSON.stringify({ isRead: nextRead, folderId }),
      });
      window.dispatchEvent(new CustomEvent('mail:refresh-folders'));
      if (onRefresh) {
        await onRefresh();
      }
    } catch (err: any) {
      setReadOverrides((prev) => ({ ...prev, [mail.id]: currentIsRead }));
      alert(err.message || '읽음 상태 변경 실패');
    }
  };

  // 필터 적용 메일 목록
  const filteredMails = useMemo(() => {
    if (activeStatusFilter === 'all') return mails;
    return mails.filter((mail) => {
      const flags = getMailStatusFlags(mail);
      switch (activeStatusFilter) {
        case 'unread':
          return !flags.isRead;
        case 'read':
          return flags.isRead;
        case 'important':
          return flags.isStarred;
        case 'new':
          return flags.isNew;
        case 'secure':
          return flags.isSecure;
        case 'answered':
          return flags.isAnswered;
        case 'forwarded':
          return flags.isForwarded;
        case 'attachment':
          return Boolean(mail.attachments && mail.attachments.length > 0);
        default:
          return true;
      }
    });
  }, [mails, activeStatusFilter, readOverrides, starredOverrides, isSent, isDraft]);

  // Client-side pagination slice if all fetched at once
  const totalPages = Math.max(1, Math.ceil(filteredMails.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedMails = filteredMails.slice(startIndex, startIndex + pageSize);

  const displayStart = filteredMails.length === 0 ? 0 : startIndex + 1;
  const displayEnd = Math.min(startIndex + pageSize, filteredMails.length);

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
        ? filteredMails.filter((m) => selectedIds.includes(m.id))
        : paginatedMails;

    if (targetMails.length === 0) return;

    const header = [
      '상태',
      isSent ? '수신자' : '발신자',
      '제목',
      isSent ? '발송일시' : '수신일시',
    ].join('\t');
    const rows = targetMails.map((m) => {
      const { dateStr, timeStr } = formatDateParts(m.createdAt);
      const person = isSent
        ? m.recipients?.map((r) => r.address).join(', ') || '(수신자 없음)'
        : m.sender;
      const { statusText } = getMailStatusFlags(m);
      return [
        statusText,
        person,
        m.subject || '(제목 없음)',
        `${dateStr} ${timeStr}`,
      ].join('\t');
    });

    const textToCopy = [header, ...rows].join('\n');
    await navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Excel (.xlsx) Export (해당 페이지 목록 또는 선택된 항목)
  const handleExcelExport = () => {
    const targetMails =
      selectedIds.length > 0
        ? filteredMails.filter((m) => selectedIds.includes(m.id))
        : paginatedMails;

    if (targetMails.length === 0) {
      alert('내보낼 메일 데이터가 없습니다.');
      return;
    }

    const headers = [
      '상태',
      isSent ? '수신자' : '발신자',
      '제목',
      isSent ? '발송일시' : '수신일시',
    ];

    const rows = targetMails.map((m) => {
      const { dateStr, timeStr } = formatDateParts(m.createdAt);
      const person = isSent
        ? m.recipients?.map((r) => r.address).join(', ') || '(수신자 없음)'
        : m.sender;
      const { statusText } = getMailStatusFlags(m);

      return [
        statusText,
        person,
        m.subject || '(제목 없음)',
        `${dateStr} ${timeStr}`,
      ];
    });

    const today = new Date().toISOString().slice(0, 10);
    const folderName = isSent ? '보낸편지함' : isTrash ? '휴지통' : isSpam ? '스팸함' : isDraft ? '임시보관함' : '받은편지함';
    exportTableToExcel({
      filename: `LEMail_${type}_${today}.xlsx`,
      sheetName: folderName,
      headers,
      rows,
    });
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

  const effectivePlaceholder =
    searchPlaceholder ||
    (isSent || isDraft ? '수신자, 제목 검색...' : '보낸사람, 제목 검색...');

  const statusFilterOptions: {
    value: string;
    label: string;
    icon: React.ReactNode;
  }[] = [
    {
      value: 'all',
      label: '전체',
      icon: <Filter className="w-3.5 h-3.5 text-slate-500" />,
    },
    {
      value: 'unread',
      label: '안읽음',
      icon: <Mail className="w-3.5 h-3.5 text-sky-600" />,
    },
    {
      value: 'read',
      label: '읽음',
      icon: <MailOpen className="w-3.5 h-3.5 text-slate-400" />,
    },
    {
      value: 'important',
      label: '중요',
      icon: <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />,
    },
    {
      value: 'new',
      label: '신규',
      icon: (
        <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-rose-500 text-[8px] font-extrabold text-white">
          N
        </span>
      ),
    },
    {
      value: 'secure',
      label: '보안',
      icon: <Lock className="w-3.5 h-3.5 text-emerald-600" />,
    },
    {
      value: 'answered',
      label: '답장',
      icon: <Reply className="w-3.5 h-3.5 text-indigo-600" />,
    },
    {
      value: 'forwarded',
      label: '전달',
      icon: <Forward className="w-3.5 h-3.5 text-violet-600" />,
    },
    {
      value: 'attachment',
      label: '첨부파일',
      icon: <Paperclip className="w-3.5 h-3.5 text-slate-500" />,
    },
  ];

  const currentFilterOption =
    statusFilterOptions.find((opt) => opt.value === activeStatusFilter) ||
    statusFilterOptions[0];

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden transition printable-area">
      {/* 인쇄 전용 타이틀 헤더 (화면에서는 숨김, 인쇄 시 상단에만 노출) */}
      <div className="hidden print:block p-4 border-b-2 border-slate-800">
        <h2 className="text-base font-bold text-slate-900">
          [LEMail] {isSent ? '보낸편지함' : isTrash ? '휴지통' : isSpam ? '스팸메일함' : isDraft ? '임시보관함' : '받은편지함'} 목록
        </h2>
        <div className="text-xs text-slate-600 mt-1">
          출력일시: {new Date().toLocaleString('ko-KR')} | 목록 {paginatedMails.length}건
        </div>
      </div>

      {/* 1. 상단 툴바: 상태 필터 + 검색창 (좌) + 다중선택 액션군 + Copy / Excel / Print 버튼 (우) */}
      <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white print-toolbar print:hidden">
        {/* 필터 + 검색창 */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* 상태 필터 드롭다운 (커스텀 팝오버) */}
          <div className="relative shrink-0" ref={filterMenuRef}>
            <button
              type="button"
              onClick={() => setIsFilterOpen((prev) => !prev)}
              className="flex items-center gap-1.5 rounded-lg bg-white border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-xs hover:border-slate-300 hover:bg-slate-50 transition cursor-pointer select-none"
              title="메일 상태 필터 선택"
            >
              <span className="flex items-center justify-center w-3.5 h-3.5 shrink-0">
                {currentFilterOption.icon}
              </span>
              <span className="font-semibold text-slate-800">{currentFilterOption.label}</span>
              <ChevronDown
                className={`w-3 h-3 text-slate-400 transition-transform duration-150 ${
                  isFilterOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {isFilterOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-44 rounded-xl border border-slate-200 bg-white py-1.5 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-3 py-1 border-b border-slate-100 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  메일 상태 필터
                </div>
                <div className="py-1 max-h-72 overflow-y-auto">
                  {statusFilterOptions.map((opt) => {
                    const isSelected = opt.value === activeStatusFilter;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          handleStatusFilterChange(opt.value);
                          setIsFilterOpen(false);
                        }}
                        className={`w-full px-3 py-1.5 text-left text-xs flex items-center justify-between transition ${
                          isSelected
                            ? 'bg-sky-50 text-sky-800 font-semibold'
                            : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span className="flex items-center justify-center w-4 h-4 shrink-0">
                            {opt.icon}
                          </span>
                          <span>{opt.label}</span>
                        </span>
                        {isSelected && (
                          <Check className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 검색창 */}
          <div className="w-full sm:w-64">
            <SearchInput
              value={search}
              onChange={onSearchChange}
              placeholder={effectivePlaceholder}
              size="md"
            />
          </div>
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

              {/* 스팸 해제 버튼 (스팸함일 때 노출) */}
              {isSpam && (
                <button
                  type="button"
                  onClick={handleBulkUnreportSpam}
                  className="btn btn-sm btn-secondary text-xs font-semibold text-emerald-700 hover:text-emerald-800 border-emerald-200 hover:border-emerald-300 bg-emerald-50 inline-flex items-center gap-1"
                  title="선택한 메일을 받은편지함으로 복원하고 발신자 차단을 해제합니다."
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>스팸 해제</span>
                </button>
              )}

              {/* 스팸 신고 버튼 (일반 편지함일 때 노출) */}
              {!isSpam && !isTrash && !isDraft && !isSent && (
                <button
                  type="button"
                  onClick={handleBulkReportSpam}
                  className="btn btn-sm btn-secondary text-xs font-medium text-amber-700 hover:text-amber-800 border-amber-200 hover:border-amber-300 bg-amber-50 inline-flex items-center gap-1"
                  title="선택한 메일을 스팸으로 신고하고 발신자를 차단합니다."
                >
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                  <span>스팸 신고</span>
                </button>
              )}

              {/* 삭제 버튼 (기본: 휴지통 이동, 휴지통에서는 미노출) */}
              {!isTrash && (
                <button
                  type="button"
                  onClick={handleBulkDeleteAction}
                  className="btn btn-sm btn-secondary text-xs font-medium text-rose-600 hover:text-rose-700 border-rose-200 hover:border-rose-300 bg-rose-50/50"
                  title="휴지통으로 이동"
                >
                  삭제
                </button>
              )}

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
              <th className="w-10 px-4 py-3 text-center print:hidden">
                <input
                  type="checkbox"
                  checked={allCurrentSelected}
                  onChange={handleSelectAll}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                  title="전체 선택"
                />
              </th>
              <th
                className="w-32 px-3 py-3 text-center whitespace-nowrap"
                title="신규 / 안읽음 / 읽음 / 보안 / 중요 / 답장 / 전달"
              >
                상태
              </th>
              <th className="w-56 px-4 py-3 whitespace-nowrap">
                {isSent ? '수신 정보' : '사원 정보'}
              </th>
              <th className="px-4 py-3 whitespace-nowrap">제목</th>
              <th className="w-40 px-4 py-3 whitespace-nowrap text-center">
                {isSent ? '발송일시' : '수신일시'}
              </th>
              <th className="w-20 px-4 py-3 text-right whitespace-nowrap print:hidden">관리</th>
            </tr>
          </thead>

          {/* 테이블 본문 */}
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {loading ? (
              <tr>
                <td colSpan={6} className="py-16 text-center text-slate-400">
                  <div className="flex items-center justify-center gap-2">
                    <RefreshCw className="h-5 w-5 animate-spin text-sky-600" />
                    <span className="font-medium">메일 목록을 불러오는 중...</span>
                  </div>
                </td>
              </tr>
            ) : paginatedMails.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-16 text-center text-slate-400">
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
                const {
                  isRead,
                  isStarred,
                  isNew,
                  isSecure,
                  isAnswered,
                  isForwarded,
                  statusText,
                } = getMailStatusFlags(mail);
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
                      className="px-4 py-3.5 text-center print:hidden"
                      onClick={(e) => handleToggleSelect(mail.id, e)}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                      />
                    </td>

                    {/* 1. 첫번째 자리: 메일상태 (화면: 아이콘, 인쇄: 텍스트) */}
                    <td
                      className="px-3 py-3.5 whitespace-nowrap text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="hidden print:inline-block font-semibold text-slate-800 text-[10px]">
                        {statusText || '-'}
                      </span>
                      <div className="flex items-center justify-center gap-1.5 print:hidden">
                        {/* 중요 상태 아이콘 */}
                        <button
                          type="button"
                          onClick={(e) => handleToggleStar(e, mail, isStarred)}
                          title={isStarred ? '중요 (클릭하여 해제)' : '중요 표시'}
                          aria-label={isStarred ? '중요' : '중요 표시'}
                          className="p-0.5 rounded hover:bg-amber-50 transition shrink-0"
                        >
                          <Star
                            className={`h-4 w-4 ${
                              isStarred
                                ? 'fill-amber-400 text-amber-400'
                                : 'text-slate-300 hover:text-amber-400'
                            }`}
                          />
                        </button>

                        {/* 읽음 / 안읽음 + 신규 상태 아이콘 */}
                        <button
                          type="button"
                          onClick={(e) => handleStatusToggleRead(e, mail, isRead)}
                          title={isNew ? '신규 / 안읽음 (클릭하여 읽음 처리)' : isRead ? '읽음 (클릭하여 안읽음 처리)' : '안읽음 (클릭하여 읽음 처리)'}
                          aria-label={isNew ? '신규 안읽음' : isRead ? '읽음' : '안읽음'}
                          className="relative p-0.5 rounded hover:bg-sky-50 transition shrink-0 inline-flex items-center"
                        >
                          {isRead ? (
                            <MailOpen className="h-4 w-4 text-slate-400" />
                          ) : (
                            <Mail className="h-4 w-4 text-sky-600" />
                          )}
                          {isNew && (
                            <span
                              title="신규"
                              className="ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-rose-500 text-[8px] font-extrabold text-white shadow-2xs"
                            >
                              N
                            </span>
                          )}
                        </button>

                        {/* 보안 상태 아이콘 */}
                        {isSecure && (
                          <span
                            title="보안"
                            aria-label="보안"
                            className="inline-flex h-5 w-5 items-center justify-center rounded bg-emerald-50 text-emerald-600 border border-emerald-200 shrink-0"
                          >
                            <Lock className="h-3.5 w-3.5" />
                          </span>
                        )}

                        {/* 답장 상태 아이콘 */}
                        {isAnswered && (
                          <span
                            title="답장"
                            aria-label="답장"
                            className="inline-flex h-5 w-5 items-center justify-center rounded bg-indigo-50 text-indigo-600 border border-indigo-200 shrink-0"
                          >
                            <Reply className="h-3.5 w-3.5" />
                          </span>
                        )}

                        {/* 전달 상태 아이콘 */}
                        {isForwarded && (
                          <span
                            title="전달"
                            aria-label="전달"
                            className="inline-flex h-5 w-5 items-center justify-center rounded bg-violet-50 text-violet-600 border border-violet-200 shrink-0"
                          >
                            <Forward className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </div>
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

                    {/* 3. 제목 */}
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

                    {/* 4. 수신일시 / 발송일시 (날짜 + 시간 함께 출력) */}
                    <td className="px-4 py-3.5 text-center whitespace-nowrap text-slate-600 font-mono">
                      {dateStr} {timeStr}
                    </td>

                    {/* 5. 관리 액션 버튼 */}
                    <td
                      className="px-4 py-3.5 text-right whitespace-nowrap print:hidden"
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
      <div className="px-5 py-3.5 border-t border-slate-100 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-slate-500 print:hidden">
        <div>
          총 <span className="font-semibold text-slate-800">{filteredMails.length}</span>건
          {activeStatusFilter !== 'all' && (
            <span className="text-slate-400"> (전체 {mails.length}건)</span>
          )}{' '}
          중{' '}
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
