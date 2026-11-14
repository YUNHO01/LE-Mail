'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  X,
  HardDrive,
  RefreshCw,
  LogOut,
  Settings,
  Users,
  Calendar as CalendarIcon,
  CalendarDays,
  Mail,
  PenSquare,
  ChevronDown,
  Download,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigation } from '../../contexts/NavigationContext';
import { usePwa } from '../../contexts/PwaContext';
import { MailFolderTree } from '../mail/MailFolderTree';

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
}

export const MobileDrawer: React.FC<MobileDrawerProps> = ({ open, onClose }) => {
  const pathname = usePathname();
  const { user, logout, refreshStorageUsage } = useAuth();
  const { canInstall, isStandalone, promptInstall } = usePwa();
  const { startNavigation } = useNavigation();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const isCompose = pathname === '/mail/compose';
  const isContacts = pathname?.startsWith('/mail/contacts');
  const isCalendar = pathname?.startsWith('/mail/calendar');

  const [mailExpanded, setMailExpanded] = useState<boolean>(!isContacts && !isCalendar);
  const [contactsExpanded, setContactsExpanded] = useState<boolean>(Boolean(isContacts));
  const [calendarExpanded, setCalendarExpanded] = useState<boolean>(Boolean(isCalendar));

  useEffect(() => {
    if (isContacts) {
      setContactsExpanded(true);
      setMailExpanded(false);
      setCalendarExpanded(false);
    } else if (isCalendar) {
      setCalendarExpanded(true);
      setMailExpanded(false);
      setContactsExpanded(false);
    } else if (pathname?.startsWith('/mail') && pathname !== '/mail/settings') {
      setMailExpanded(true);
      setContactsExpanded(false);
      setCalendarExpanded(false);
    }
  }, [isContacts, isCalendar, pathname]);

  if (!open) return null;

  const quotaMb = user?.mailboxQuotaMb ?? 512;
  const usedMb = user?.usedMb ?? 0;
  const usagePercent =
    user?.usagePercent ??
    (quotaMb > 0 ? Math.min(100, Math.round((usedMb / quotaMb) * 100)) : 100);
  const messageCount = user?.messageCount ?? 0;
  const freeMb = Math.max(0, Math.round((quotaMb - usedMb) * 10) / 10);
  const avatarInitial = (user?.name || user?.email || 'U').trim().charAt(0).toUpperCase();

  const handleToggleMail = () => {
    setMailExpanded((prev) => {
      const next = !prev;
      if (next) {
        setContactsExpanded(false);
        setCalendarExpanded(false);
      }
      return next;
    });
  };

  const handleToggleContacts = () => {
    setContactsExpanded((prev) => {
      const next = !prev;
      if (next) {
        setMailExpanded(false);
        setCalendarExpanded(false);
      }
      return next;
    });
  };

  const handleToggleCalendar = () => {
    setCalendarExpanded((prev) => {
      const next = !prev;
      if (next) {
        setMailExpanded(false);
        setContactsExpanded(false);
      }
      return next;
    });
  };

  const handleRefreshQuota = async () => {
    setIsRefreshing(true);
    try {
      await refreshStorageUsage?.();
    } finally {
      setTimeout(() => setIsRefreshing(false), 400);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-[1px] transition-opacity"
        onClick={onClose}
      />

      {/* Drawer Panel (Webmail UserSidebar 스타일) */}
      <aside className="relative z-10 flex h-full w-72 max-w-[82vw] flex-col bg-[#f5f5f7] text-[#1d1d1f] border-r border-black/[0.08] shadow-2xl">
        {/* User Profile Header */}
        <div className="flex items-center justify-between border-b border-black/[0.08] px-4 py-3.5 bg-white/60">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#2997ff] to-[#0071e3] text-xs font-bold text-white shadow-xs">
              {avatarInitial}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#1d1d1f]">
                {user?.name || '사용자'}
              </p>
              <p className="truncate text-[11px] text-[#6e6e73]">{user?.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="메뉴 닫기"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#6e6e73] hover:bg-black/[0.05] hover:text-[#1d1d1f] transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-3 py-3.5 space-y-3.5">
          {/* Compose Mail Button */}
          <div>
            <Link
              href="/mail/compose"
              onClick={() => {
                onClose();
                startNavigation('/mail/compose');
              }}
              className={`flex items-center justify-center gap-2 w-full py-2.5 px-3.5 rounded-xl font-medium text-[13px] shadow-xs transition-all duration-150 ${
                isCompose
                  ? 'bg-[#0071e3] text-white ring-2 ring-[#0071e3]/30'
                  : 'bg-[#0071e3] text-white hover:bg-[#0077ed] active:scale-[0.98]'
              }`}
            >
              <PenSquare className="h-4 w-4" />
              <span>메일 쓰기</span>
            </Link>
          </div>

          {/* 1. 메일함 */}
          <div className="space-y-1">
            <button
              type="button"
              onClick={handleToggleMail}
              className="flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-[11px] font-semibold tracking-wide text-[#86868b] hover:text-[#1d1d1f] hover:bg-black/[0.04] transition group"
            >
              <div className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 text-[#0071e3]" />
                <span>메일함</span>
              </div>
              <ChevronDown
                className={`h-3.5 w-3.5 text-[#86868b] group-hover:text-[#1d1d1f] transition-transform duration-200 ${
                  mailExpanded ? 'rotate-0' : '-rotate-90'
                }`}
              />
            </button>

            {mailExpanded && (
              <div className="pt-0.5">
                <MailFolderTree onSelectFolder={onClose} />
              </div>
            )}
          </div>

          {/* 2. 주소록 */}
          <div className="space-y-1 pt-2 border-t border-black/[0.06]">
            <button
              type="button"
              onClick={handleToggleContacts}
              className="flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-[11px] font-semibold tracking-wide text-[#86868b] hover:text-[#1d1d1f] hover:bg-black/[0.04] transition group"
            >
              <div className="flex items-center gap-2">
                <Users className="h-3.5 w-3.5 text-emerald-600" />
                <span>주소록</span>
              </div>
              <ChevronDown
                className={`h-3.5 w-3.5 text-[#86868b] group-hover:text-[#1d1d1f] transition-transform duration-200 ${
                  contactsExpanded ? 'rotate-0' : '-rotate-90'
                }`}
              />
            </button>

            {contactsExpanded && (
              <div className="space-y-0.5 pl-1 pt-0.5 text-xs">
                <Link
                  href="/mail/contacts"
                  onClick={() => {
                    onClose();
                    startNavigation('/mail/contacts');
                  }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium transition ${
                    isContacts
                      ? 'bg-[#007aff]/12 text-[#0071e3] font-semibold'
                      : 'text-[#1d1d1f] hover:bg-black/[0.04]'
                  }`}
                >
                  <Users className="h-3.5 w-3.5 text-[#6e6e73]" />
                  <span>전체 연락처</span>
                </Link>
              </div>
            )}
          </div>

          {/* 3. 캘린더 */}
          <div className="space-y-1 pt-2 border-t border-black/[0.06]">
            <button
              type="button"
              onClick={handleToggleCalendar}
              className="flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-[11px] font-semibold tracking-wide text-[#86868b] hover:text-[#1d1d1f] hover:bg-black/[0.04] transition group"
            >
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-3.5 w-3.5 text-violet-600" />
                <span>캘린더</span>
              </div>
              <ChevronDown
                className={`h-3.5 w-3.5 text-[#86868b] group-hover:text-[#1d1d1f] transition-transform duration-200 ${
                  calendarExpanded ? 'rotate-0' : '-rotate-90'
                }`}
              />
            </button>

            {calendarExpanded && (
              <div className="space-y-0.5 pl-1 pt-0.5 text-xs">
                <Link
                  href="/mail/calendar"
                  onClick={() => {
                    onClose();
                    startNavigation('/mail/calendar');
                  }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium transition ${
                    isCalendar
                      ? 'bg-[#007aff]/12 text-[#0071e3] font-semibold'
                      : 'text-[#1d1d1f] hover:bg-black/[0.04]'
                  }`}
                >
                  <CalendarDays className="h-3.5 w-3.5 text-[#6e6e73]" />
                  <span>전체 일정</span>
                </Link>
              </div>
            )}
          </div>

          {/* 4. 환경설정 */}
          <div className="pt-2 border-t border-black/[0.06]">
            <Link
              href="/mail/settings"
              onClick={() => {
                onClose();
                startNavigation('/mail/settings');
              }}
              className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium transition group ${
                pathname === '/mail/settings'
                  ? 'bg-[#007aff]/12 text-[#0071e3] font-semibold'
                  : 'text-[#6e6e73] hover:text-[#1d1d1f] hover:bg-black/[0.04]'
              }`}
            >
              <Settings className="h-3.5 w-3.5 text-[#86868b] group-hover:text-[#0071e3] transition" />
              <span>환경설정</span>
            </Link>
          </div>
        </div>

        {/* Storage Quota Card & Logout */}
        <div className="border-t border-black/[0.08] p-3.5 space-y-2.5 bg-[#f5f5f7]">
          <div className="rounded-xl bg-white/80 p-3 border border-black/[0.06] text-xs">
            <div className="flex items-center justify-between text-[#1d1d1f] font-medium mb-1.5">
              <span className="flex items-center gap-1.5 font-semibold text-[#1d1d1f]">
                <HardDrive className="h-3.5 w-3.5 text-[#0071e3]" />
                <span>사서함 용량</span>
              </span>
              <span
                className={`text-[11px] font-semibold tabular-nums ${
                  usagePercent >= 90
                    ? 'text-[#ff3b30]'
                    : usagePercent >= 70
                    ? 'text-[#ff9500]'
                    : 'text-[#0071e3]'
                }`}
              >
                {usagePercent}%
              </span>
            </div>

            <div className="h-1.5 w-full bg-black/[0.08] rounded-full overflow-hidden mb-2">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  usagePercent >= 90
                    ? 'bg-[#ff3b30]'
                    : usagePercent >= 70
                    ? 'bg-[#ff9500]'
                    : 'bg-[#0071e3]'
                }`}
                style={{
                  width: `${Math.min(100, Math.max(usedMb > 0 ? 2 : 0, usagePercent))}%`,
                }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-[#6e6e73] tabular-nums">
              <span>
                <strong className="text-[#1d1d1f] font-semibold">{usedMb} MB</strong> / {quotaMb} MB
              </span>
              <span>{freeMb} MB 남음</span>
            </div>

            <div className="mt-2 pt-2 border-t border-black/[0.06] flex items-center justify-between text-[10px] text-[#86868b]">
              <span>메일 {messageCount.toLocaleString()}통 보관 중</span>
              <button
                type="button"
                onClick={handleRefreshQuota}
                disabled={isRefreshing}
                aria-label="용량 새로고침"
                className="p-1 rounded hover:bg-black/[0.05] text-[#86868b] hover:text-[#0071e3] transition"
              >
                <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin text-[#0071e3]' : ''}`} />
              </button>
            </div>
          </div>

          {canInstall && !isStandalone && (
            <button
              type="button"
              onClick={() => {
                onClose();
                promptInstall();
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#007AFF]/10 border border-[#007AFF]/20 py-2.5 text-xs font-semibold text-[#007AFF] active:scale-[0.98] transition"
            >
              <Download className="h-3.5 w-3.5" />
              <span>홈 화면에 앱 설치</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              onClose();
              logout();
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-black/[0.08] bg-white py-2.5 text-xs font-semibold text-[#1d1d1f] hover:bg-black/[0.03] active:scale-[0.98] transition"
          >
            <LogOut className="h-3.5 w-3.5 text-[#6e6e73]" />
            <span>로그아웃</span>
          </button>
        </div>
      </aside>
    </div>
  );
};
