'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MailMessageDto, MailFolderDto, FolderType } from '@lemail/shared-types';
import { fetchApi } from '@/lib/api';
import { SearchInput, TableUtilityButtons, SelectDropdown } from '@/components/common';
import { MailReadingPane } from '@/components/mail/MailReadingPane';
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
  const [selectedMailId, setSelectedMailId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 20;
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

  const MAX_MULTI_OPEN_COUNT = 5;

  const handleBulkOpen = () => {
    if (selectedIds.length === 0 || isDraft) return;
    if (selectedIds.length > MAX_MULTI_OPEN_COUNT) {
      alert(`동시 열람은 최대 ${MAX_MULTI_OPEN_COUNT}건까지 선택할 수 있습니다. (현재 ${selectedIds.length}건 선택됨)`);
      return;
    }
    if (selectedIds.length === 1) {
      router.push(`/mail/${selectedIds[0]}`);
      return;
    }
    const orderedIds = filteredMails
      .filter((m) => selectedIds.includes(m.id))
      .map((m) => m.id);
    const targetIds = orderedIds.length > 0 ? orderedIds : selectedIds;
    router.push(`/mail/view?ids=${encodeURIComponent(targetIds.join(','))}`);
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

  // Row navigation / 3-Pane Selection & Auto Read
  const handleRowClick = (mail: MailMessageDto) => {
    if (isDraft) {
      router.push(`/mail/compose?draftId=${mail.id}`);
      return;
    }
    if (!mail.isRead) {
      setReadOverrides((prev) => ({ ...prev, [mail.id]: true }));
      fetchApi(`/mails/${mail.id}/read`, {
        method: 'PATCH',
        body: JSON.stringify({ isRead: true }),
      }).catch((err) => console.error('Auto mark read error:', err));
      window.dispatchEvent(new CustomEvent('mail:refresh-folders'));
    }
    if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
      setSelectedMailId(mail.id);
    } else {
      router.push(`/mail/${mail.id}`);
    }
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

  const folderTitle =
    folderName ||
    (isSent
      ? '보낸편지함'
      : isTrash
      ? '휴지통'
      : isSpam
      ? '스팸메일함'
      : isDraft
      ? '임시보관함'
      : '받은편지함');

  const unreadInList = useMemo(
    () => mails.filter((m) => !getMailStatusFlags(m).isRead).length,
    [mails, readOverrides],
  );

  const toggleSelectMode = () => {
    setSelectMode((prev) => {
      const next = !prev;
      if (!next) {
        setSelectedIds([]);
      }
      return next;
    });
  };

  return (
    <div className="flex-1 flex min-h-0 bg-white overflow-hidden printable-area">
      {/* 인쇄 전용 타이틀 헤더 */}
      <div className="hidden print:block p-4 border-b-2 border-slate-800">
        <h2 className="text-base font-bold text-slate-900">[LEMail] {folderTitle} 목록</h2>
        <div className="text-xs text-slate-600 mt-1">
          출력일시: {new Date().toLocaleString('ko-KR')} | 목록 {paginatedMails.length}건
        </div>
      </div>

      {/* PANE 2: iCloud Style Mail List Column */}
      <section className="w-full lg:w-[360px] xl:w-[395px] shrink-0 border-r border-black/[0.08] flex flex-col min-h-0 bg-white print:w-full print:border-none">
        {/* Sticky List Header */}
        <div className="px-4 pt-4 pb-2.5 border-b border-black/[0.06] space-y-2.5 bg-white/95 backdrop-blur-md print:hidden">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h1 className="text-[19px] font-bold tracking-tight text-[#1d1d1f] truncate">
                {folderTitle}
              </h1>
              <p className="text-[11px] text-[#86868b] mt-0.5 tabular-nums">
                전체 {filteredMails.length}통 · 읽지 않음 {unreadInList}통
              </p>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={toggleSelectMode}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                  selectMode || selectedIds.length > 0
                    ? 'bg-[#0071e3] text-white'
                    : 'text-[#0071e3] hover:bg-[#007aff]/10'
                }`}
              >
                {selectMode ? '완료' : '선택'}
              </button>
              {onRefresh && (
                <button
                  type="button"
                  onClick={() => onRefresh()}
                  className="p-1.5 rounded-lg text-[#6e6e73] hover:bg-black/[0.05] hover:text-[#1d1d1f] transition"
                  title="새로고침"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-[#0071e3]' : ''}`} />
                </button>
              )}
            </div>
          </div>

          {/* Search + Filter + Utility Row */}
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <SearchInput
                value={search}
                onChange={onSearchChange}
                placeholder={effectivePlaceholder}
                size="sm"
              />
            </div>
            <div className="shrink-0">
              <SelectDropdown
                options={statusFilterOptions}
                value={activeStatusFilter}
                onChange={handleStatusFilterChange}
                headerLabel="메일 상태 필터"
                size="sm"
                menuWidthClass="w-40"
                title="메일 상태 필터 선택"
              />
            </div>
          </div>

          {/* Select All (Only in Select Mode) */}
          {(selectMode || selectedIds.length > 0) && (
            <div className="pt-0.5">
              <label className="inline-flex items-center gap-1.5 text-[11px] text-[#6e6e73] cursor-pointer">
                <input
                  type="checkbox"
                  checked={allCurrentSelected}
                  onChange={handleSelectAll}
                  className="h-3.5 w-3.5 rounded border-black/20 accent-[#0071e3] cursor-pointer"
                />
                <span>현재 페이지 전체 선택</span>
              </label>
            </div>
          )}

          {/* Bulk Action Bar (when items are selected) */}
          {selectedIds.length > 0 && (
            <div className="pt-2 border-t border-black/[0.06] flex flex-wrap items-center justify-between gap-1.5">
              <span className="text-[11px] font-semibold text-[#0071e3]">
                {selectedIds.length}개 선택됨
              </span>
              <div className="flex items-center gap-1 flex-wrap">
                {!isDraft && (
                  <button
                    type="button"
                    onClick={handleBulkOpen}
                    title={
                      selectedIds.length > MAX_MULTI_OPEN_COUNT
                        ? `동시 열람은 최대 ${MAX_MULTI_OPEN_COUNT}건까지 가능합니다.`
                        : '선택한 메일 열람'
                    }
                    className="px-2 py-1 rounded-md text-[11px] font-medium bg-[#007aff]/10 text-[#0071e3] hover:bg-[#007aff]/20 transition"
                  >
                    열람
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleBulkReadAction}
                  className="px-2 py-1 rounded-md text-[11px] font-medium bg-black/[0.05] text-[#1d1d1f] hover:bg-black/[0.09] transition"
                >
                  읽음
                </button>

                {/* 이동 드롭다운 */}
                <div className="relative" ref={moveMenuRef}>
                  <button
                    type="button"
                    onClick={() => setIsMoveOpen((prev) => !prev)}
                    className="px-2 py-1 rounded-md text-[11px] font-medium bg-black/[0.05] text-[#1d1d1f] hover:bg-black/[0.09] inline-flex items-center gap-1 transition"
                  >
                    <FolderInput className="w-3 h-3" />
                    <span>이동</span>
                  </button>
                  {isMoveOpen && (
                    <div className="absolute right-0 top-full mt-1.5 w-56 rounded-xl border border-black/[0.08] bg-white py-1.5 shadow-xl z-50">
                      <div className="px-3 py-1 border-b border-black/[0.06] text-[11px] font-semibold text-[#86868b]">
                        이동할 편지함 선택
                      </div>
                      <div className="max-h-56 overflow-y-auto py-1">
                        {flattenedFolders.map((f) => {
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
                                  ? 'text-[#86868b] cursor-not-allowed'
                                  : 'text-[#1d1d1f] hover:bg-[#007aff]/10 hover:text-[#0071e3]'
                              }`}
                            >
                              <span className="flex items-center gap-2 truncate">
                                {getFolderIcon(f.type)}
                                <span className="truncate">{f.name}</span>
                              </span>
                              {isCurrent && <span className="text-[10px] text-[#86868b]">(현재)</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {isSpam && (
                  <button
                    type="button"
                    onClick={handleBulkUnreportSpam}
                    className="px-2 py-1 rounded-md text-[11px] font-medium bg-[#34c759]/12 text-[#248a3d] hover:bg-[#34c759]/20 transition"
                  >
                    스팸해제
                  </button>
                )}
                {!isSpam && !isTrash && !isDraft && !isSent && (
                  <button
                    type="button"
                    onClick={handleBulkReportSpam}
                    className="px-2 py-1 rounded-md text-[11px] font-medium bg-[#ff9500]/12 text-[#b25000] hover:bg-[#ff9500]/20 transition"
                  >
                    스팸신고
                  </button>
                )}
                {!isTrash && (
                  <button
                    type="button"
                    onClick={handleBulkDeleteAction}
                    className="px-2 py-1 rounded-md text-[11px] font-medium bg-[#ff3b30]/10 text-[#ff3b30] hover:bg-[#ff3b30]/20 transition"
                  >
                    삭제
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleBulkPermanentDelete}
                  className="px-2 py-1 rounded-md text-[11px] font-medium bg-[#ff3b30] text-white hover:bg-[#d70015] transition"
                >
                  완전삭제
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Scrollable Mail Card List */}
        <div className="flex-1 overflow-y-auto py-1.5 divide-y divide-black/[0.04]">
          {loading ? (
            <div className="py-20 text-center text-[#86868b]">
              <div className="flex flex-col items-center gap-2">
                <RefreshCw className="h-5 w-5 animate-spin text-[#0071e3]" />
                <span className="text-xs font-medium">메일 목록을 불러오는 중...</span>
              </div>
            </div>
          ) : paginatedMails.length === 0 ? (
            <div className="py-20 px-6 text-center text-[#86868b]">
              <Mail className="h-10 w-10 text-[#d2d2d7] mx-auto mb-2 stroke-[1.5]" />
              <p className="font-medium text-[#1d1d1f] text-sm">{emptyMessage}</p>
              {emptySubMessage && (
                <p className="text-xs text-[#86868b] mt-1">{emptySubMessage}</p>
              )}
            </div>
          ) : (
            paginatedMails.map((mail) => {
              const { dateStr, timeStr } = formatDateParts(mail.createdAt);
              const { isRead, isStarred, isNew, isSecure, isAnswered, isForwarded } =
                getMailStatusFlags(mail);
              const isChecked = selectedIds.includes(mail.id);
              const isActiveRow = selectedMailId === mail.id;

              const personRaw = isSent
                ? mail.recipients && mail.recipients.length > 0
                  ? mail.recipients.map((r) => r.address).join(', ')
                  : '(수신자 없음)'
                : mail.sender;
              const { name, address } = extractPersonInfo(personRaw);

              return (
                <div
                  key={mail.id}
                  onClick={() => handleRowClick(mail)}
                  className={`group mx-2 my-0.5 px-3 py-2.5 rounded-xl cursor-pointer transition ${
                    isActiveRow
                      ? 'bg-[#007aff]/12'
                      : isChecked
                      ? 'bg-[#007aff]/5'
                      : 'hover:bg-black/[0.03]'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    {/* Left: Unread Dot or Selection Checkbox */}
                    <div
                      className="pt-1.5 w-4 shrink-0 flex justify-center print:hidden"
                      onClick={(e) => {
                        if (selectMode || selectedIds.length > 0) {
                          handleToggleSelect(mail.id, e);
                        } else {
                          handleStatusToggleRead(e, mail, isRead);
                        }
                      }}
                    >
                      {selectMode || selectedIds.length > 0 ? (
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="h-3.5 w-3.5 rounded border-black/20 accent-[#0071e3] cursor-pointer"
                        />
                      ) : !isRead ? (
                        <span
                          title="읽지 않음 (클릭하여 읽음 처리)"
                          className="w-2 h-2 rounded-full bg-[#007aff]"
                        />
                      ) : (
                        <span className="w-2 h-2 rounded-full opacity-0 group-hover:opacity-40 bg-[#86868b] transition" />
                      )}
                    </div>

                    {/* Right: Sender, Time, Subject, Snippet */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className={`text-[13.5px] truncate ${
                              !isRead ? 'font-bold text-[#1d1d1f]' : 'font-medium text-[#1d1d1f]'
                            }`}
                          >
                            {name || address || '(발신자 없음)'}
                          </span>
                          {isNew && (
                            <span className="inline-flex h-3.5 px-1 items-center justify-center rounded-full bg-[#007aff] text-[9px] font-bold text-white shrink-0">
                              N
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {isSecure && (
                            <Lock className="w-3 h-3 text-[#34c759]" aria-label="보안메일" />
                          )}
                          {isAnswered && (
                            <Reply className="w-3 h-3 text-[#0071e3]" aria-label="답장함" />
                          )}
                          {isForwarded && (
                            <Forward className="w-3 h-3 text-violet-500" aria-label="전달함" />
                          )}
                          {mail.attachments && mail.attachments.length > 0 && (
                            <Paperclip className="w-3 h-3 text-[#86868b]" aria-label="첨부파일" />
                          )}
                          <button
                            type="button"
                            onClick={(e) => handleToggleStar(e, mail, isStarred)}
                            className={`p-0.5 rounded transition ${
                              isStarred
                                ? 'text-[#ff9500]'
                                : 'text-[#d2d2d7] opacity-0 group-hover:opacity-100 hover:text-[#ff9500]'
                            }`}
                            title={isStarred ? '중요 해제' : '중요 표시'}
                          >
                            <Star
                              className={`h-3.5 w-3.5 ${isStarred ? 'fill-[#ff9500]' : ''}`}
                            />
                          </button>
                          <span
                            className={`text-[11px] tabular-nums ${
                              !isRead ? 'text-[#0071e3] font-medium' : 'text-[#86868b]'
                            }`}
                          >
                            {dateStr} {timeStr}
                          </span>
                        </div>
                      </div>

                      <div
                        className={`text-[13px] truncate mt-0.5 ${
                          !isRead ? 'font-semibold text-[#1d1d1f]' : 'text-[#1d1d1f]/85'
                        }`}
                      >
                        {mail.subject || '(제목 없음)'}
                      </div>

                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <span className="text-[11.5px] text-[#86868b] truncate">
                          {mail.body?.text
                            ? mail.body.text.replace(/\s+/g, ' ').trim()
                            : address || ''}
                        </span>
                        {/* Hover Quick Delete */}
                        {onDelete && (
                          <button
                            type="button"
                            onClick={(e) => onDelete(e, mail.id)}
                            title="삭제"
                            className="hidden group-hover:inline-flex p-1 rounded-md text-[#86868b] hover:bg-[#ff3b30]/10 hover:text-[#ff3b30] transition shrink-0 print:hidden"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Compact Pagination Footer */}
        <div className="px-4 py-2.5 border-t border-black/[0.06] bg-white flex items-center justify-between text-[11px] text-[#86868b] print:hidden">
          <span className="tabular-nums">
            {displayStart}-{displayEnd} / {filteredMails.length}건
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-1 rounded-md hover:bg-black/[0.05] disabled:opacity-30 transition"
                title="이전 페이지"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="px-1.5 font-medium text-[#1d1d1f] tabular-nums">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="p-1 rounded-md hover:bg-black/[0.05] disabled:opacity-30 transition"
                title="다음 페이지"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </section>

      {/* PANE 3: Reading Pane (Desktop lg+) */}
      <div className="hidden lg:flex flex-1 min-w-0 min-h-0 flex-col bg-white print:hidden">
        <MailReadingPane
          mailId={selectedMailId}
          onRefreshList={onRefresh}
          onDeleted={(deletedId) => {
            if (selectedMailId === deletedId) {
              setSelectedMailId(null);
            }
          }}
          onReadChanged={(id, nextRead) => {
            setReadOverrides((prev) => ({ ...prev, [id]: nextRead }));
          }}
          onStarChanged={(id, nextStar) => {
            setStarredOverrides((prev) => ({ ...prev, [id]: nextStar }));
          }}
        />
      </div>
    </div>
  );
};
