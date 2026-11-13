'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MailMessageDto, MailFolderDto, FolderType } from '@lemail/shared-types';
import { fetchApi } from '@/lib/api';
import {
  Search,
  Paperclip,
  Trash2,
  MailOpen,
  Mail,
  RefreshCw,
  Star,
  PenSquare,
  Check,
  FolderInput,
  X,
  Lock,
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

const AVATAR_COLORS = [
  'bg-sky-100 text-sky-700',
  'bg-indigo-100 text-indigo-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-violet-100 text-violet-700',
];

function getAvatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitial(name: string): string {
  const clean = (name || '?').replace(/["'<>]/g, '').trim();
  return clean.charAt(0).toUpperCase() || '?';
}

function formatMobileDate(dateStr?: string | Date | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  if (isToday) {
    return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: true });
  }
  if (d.getFullYear() === now.getFullYear()) {
    return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  }
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export const MailDataTable: React.FC<MailDataTableProps> = ({
  mails,
  loading,
  type = 'inbox',
  folderId,
  search,
  onSearchChange,
  onToggleRead,
  onBulkDelete,
  onBulkPermanentDelete,
  onBulkMove,
  onBulkToggleRead,
  onRefresh,
  emptyMessage = '메일이 없습니다.',
  emptySubMessage = '새로운 메일이 도착하면 이곳에 표시됩니다.',
  searchPlaceholder = '메일 검색',
}) => {
  const router = useRouter();
  const [chipFilter, setChipFilter] = useState<'all' | 'unread' | 'starred' | 'attachment'>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [moveSheetOpen, setMoveSheetOpen] = useState(false);
  const [folders, setFolders] = useState<MailFolderDto[]>([]);

  useEffect(() => {
    setSelectedIds([]);
  }, [mails]);

  const loadFolders = async () => {
    try {
      const data = await fetchApi<MailFolderDto[]>('/mail-folders');
      setFolders(data || []);
    } catch {
      // ignore
    }
  };

  const filteredMails = useMemo(() => {
    return (mails || []).filter((m) => {
      if (chipFilter === 'unread' && m.isRead) return false;
      if (chipFilter === 'starred' && !m.isStarred) return false;
      if (chipFilter === 'attachment' && !(m.attachments && m.attachments.length > 0)) return false;
      return true;
    });
  }, [mails, chipFilter]);

  const unreadCount = useMemo(
    () => (mails || []).filter((m) => !m.isRead).length,
    [mails],
  );

  const toggleSelect = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleRefresh = async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setTimeout(() => setRefreshing(false), 400);
    }
  };

  const handleToggleStar = async (e: React.MouseEvent, mail: MailMessageDto) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await fetchApi(`/mails/${mail.id}/star`, {
        method: 'PATCH',
        body: JSON.stringify({ isStarred: !mail.isStarred }),
      });
      await onRefresh?.();
    } catch {
      // ignore
    }
  };

  const getMailHref = (mail: MailMessageDto) => {
    if (type === 'drafts') {
      return `/mail/compose?draftId=${mail.id}`;
    }
    return `/mail/${mail.id}`;
  };

  return (
    <div className="pb-6">
      {/* 검색바 + 새로고침 */}
      <div className="px-3 pt-1 pb-2.5 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-full bg-white/90 py-2.5 pl-10 pr-9 text-sm text-slate-900 placeholder-slate-400 shadow-[0_1px_2px_rgba(0,0,0,0.04)] border border-slate-200/70 focus:border-[#007AFF] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/15"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-slate-200 p-0.5 text-slate-500"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {onRefresh && (
          <button
            type="button"
            onClick={handleRefresh}
            aria-label="새로고침"
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow-[0_1px_2px_rgba(0,0,0,0.04)] border border-slate-200/70 active:scale-95"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin text-[#007AFF]' : ''}`} />
          </button>
        )}
      </div>

      {/* 필터 칩 */}
      <div className="no-scrollbar flex items-center gap-2 overflow-x-auto px-3 pb-3">
        {[
          { key: 'all', label: '전체', count: mails.length },
          { key: 'unread', label: '안읽음', count: unreadCount },
          { key: 'starred', label: '중요' },
          { key: 'attachment', label: '첨부' },
        ].map((chip) => {
          const active = chipFilter === chip.key;
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => setChipFilter(chip.key as any)}
              className={`flex flex-shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                active
                  ? 'bg-[#007AFF] text-white shadow-sm shadow-blue-500/25'
                  : 'bg-white text-slate-600 border border-slate-200/80'
              }`}
            >
              <span>{chip.label}</span>
              {typeof chip.count === 'number' && chip.count > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                    active ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {chip.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 다중 선택 액션 바 */}
      {selectedIds.length > 0 && (
        <div className="mx-3 mb-2.5 flex items-center justify-between rounded-2xl bg-[#007AFF] px-3.5 py-2.5 text-white shadow-md">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="rounded-full bg-white/20 p-1"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <span className="text-xs font-bold">{selectedIds.length}개 선택</span>
          </div>

          <div className="flex items-center gap-1">
            {onBulkToggleRead && (
              <button
                type="button"
                onClick={() => onBulkToggleRead(selectedIds, true)}
                className="flex items-center gap-1 rounded-xl bg-white/15 px-2.5 py-1.5 text-xs font-semibold active:bg-white/25"
              >
                <MailOpen className="h-3.5 w-3.5" />
                <span>읽음</span>
              </button>
            )}
            {onBulkMove && (
              <button
                type="button"
                onClick={() => {
                  loadFolders();
                  setMoveSheetOpen(true);
                }}
                className="flex items-center gap-1 rounded-xl bg-white/15 px-2.5 py-1.5 text-xs font-semibold active:bg-white/25"
              >
                <FolderInput className="h-3.5 w-3.5" />
                <span>이동</span>
              </button>
            )}
            {(onBulkDelete || onBulkPermanentDelete) && (
              <button
                type="button"
                onClick={() =>
                  type === 'trash' && onBulkPermanentDelete
                    ? onBulkPermanentDelete(selectedIds)
                    : onBulkDelete?.(selectedIds)
                }
                className="flex items-center gap-1 rounded-xl bg-rose-500 px-2.5 py-1.5 text-xs font-semibold active:bg-rose-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>삭제</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* 메일 목록 카드 */}
      <div className="mx-3 overflow-hidden rounded-2xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-slate-200/60">
        {loading ? (
          <div className="divide-y divide-slate-100">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-start gap-3 p-3.5 animate-pulse">
                <div className="h-10 w-10 rounded-full bg-slate-200 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="flex justify-between">
                    <div className="h-3.5 w-28 rounded bg-slate-200" />
                    <div className="h-3 w-12 rounded bg-slate-100" />
                  </div>
                  <div className="h-3.5 w-3/4 rounded bg-slate-200" />
                  <div className="h-3 w-full rounded bg-slate-100" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredMails.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <Mail className="h-6 w-6" />
            </div>
            <p className="text-sm font-semibold text-slate-700">{emptyMessage}</p>
            <p className="mt-1 text-xs text-slate-400">{emptySubMessage}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredMails.map((mail) => {
              const isSelected = selectedIds.includes(mail.id);
              const isSentOrDraft = type === 'sent' || type === 'drafts';
              const displayParty = isSentOrDraft
                ? mail.recipients?.[0]?.address || '(받는사람 없음)'
                : mail.sender || '(발신자 없음)';
              const displayName = displayParty.split('<')[0].trim() || displayParty;
              const previewText =
                (mail.body?.text || '').replace(/\s+/g, ' ').trim() || '내용 미리보기가 없습니다.';
              const hasAttachment = Boolean(mail.attachments && mail.attachments.length > 0);
              const dateLabel = formatMobileDate(mail.createdAt);

              return (
                <div
                  key={mail.id}
                  onClick={() => router.push(getMailHref(mail))}
                  className={`flex items-start gap-3 px-3.5 py-3 transition-colors active:bg-slate-50 cursor-pointer ${
                    isSelected ? 'bg-sky-50/70' : !mail.isRead ? 'bg-white' : 'bg-white'
                  }`}
                >
                  {/* 아바타 / 선택 토글 */}
                  <button
                    type="button"
                    onClick={(e) => toggleSelect(e, mail.id)}
                    aria-label="메일 선택"
                    className="relative mt-0.5 flex-shrink-0"
                  >
                    {!mail.isRead && !isSelected && (
                      <span className="absolute -left-2 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-[#007AFF]" />
                    )}
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold transition-all ${
                        isSelected
                          ? 'bg-[#007AFF] text-white'
                          : getAvatarColor(displayName)
                      }`}
                    >
                      {isSelected ? <Check className="h-4 w-4" /> : getInitial(displayName)}
                    </div>
                  </button>

                  {/* 메일 본문 요약 */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`truncate text-[14px] ${
                          !mail.isRead ? 'font-bold text-slate-900' : 'font-semibold text-slate-700'
                        }`}
                      >
                        {displayName}
                      </span>
                      <span
                        className={`flex-shrink-0 text-[11px] ${
                          !mail.isRead ? 'font-semibold text-[#007AFF]' : 'text-slate-400'
                        }`}
                      >
                        {dateLabel}
                      </span>
                    </div>

                    <div className="mt-0.5 flex items-center gap-1.5">
                      {mail.isSecure && (
                        <Lock className="h-3 w-3 flex-shrink-0 text-amber-500" />
                      )}
                      <p
                        className={`truncate text-[13px] ${
                          !mail.isRead ? 'font-semibold text-slate-900' : 'font-normal text-slate-700'
                        }`}
                      >
                        {mail.subject || '(제목 없음)'}
                      </p>
                    </div>

                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <p className="truncate text-xs text-slate-400">{previewText}</p>
                      <div className="flex flex-shrink-0 items-center gap-1.5">
                        {hasAttachment && (
                          <Paperclip className="h-3.5 w-3.5 text-slate-400" />
                        )}
                        <button
                          type="button"
                          onClick={(e) => handleToggleStar(e, mail)}
                          aria-label="중요 표시"
                          className="p-0.5"
                        >
                          <Star
                            className={`h-3.5 w-3.5 ${
                              mail.isStarred
                                ? 'fill-amber-400 text-amber-400'
                                : 'text-slate-300'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 플로팅 메일 쓰기 FAB */}
      <Link
        href="/mail/compose"
        aria-label="새 메일 작성"
        className="fixed bottom-20 right-4 z-20 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#007AFF] text-white shadow-lg shadow-blue-500/35 active:scale-95 transition-transform"
      >
        <PenSquare className="h-6 w-6" />
      </Link>

      {/* 폴더 이동 바텀 시트 */}
      {moveSheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-900/40 backdrop-blur-[1px]">
          <div className="w-full rounded-t-3xl bg-white p-5 pb-8 shadow-2xl">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300" />
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">폴더로 이동</h3>
              <button
                type="button"
                onClick={() => setMoveSheetOpen(false)}
                className="text-xs font-semibold text-slate-500"
              >
                닫기
              </button>
            </div>
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {folders
                .filter((f) => f.id !== folderId && f.type !== FolderType.DRAFTS)
                .map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={async () => {
                      await onBulkMove?.(selectedIds, f.id);
                      setMoveSheetOpen(false);
                    }}
                    className="flex w-full items-center justify-between rounded-xl px-3.5 py-3 text-left text-sm font-medium text-slate-800 hover:bg-slate-100 active:bg-slate-200"
                  >
                    <span>{f.name}</span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
