'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigation } from '../../contexts/NavigationContext';
import { MailFolderTree } from '../mail/MailFolderTree';
import {
  Mail,
  Shield,
  ArrowRight,
  PenSquare,
  HardDrive,
  RefreshCw,
  Settings,
  Users,
  Star,
  Building2,
  UserCheck,
  ChevronDown,
  Calendar as CalendarIcon,
  CalendarDays,
  CalendarClock,
} from 'lucide-react';
import { contactsApi, calendarApi } from '../../lib/api';
import { ContactGroupDto, CalendarDto } from '@lemail/shared-types';

interface UserSidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

export const UserSidebar: React.FC<UserSidebarProps> = ({
  sidebarOpen,
  setSidebarOpen,
}) => {
  const pathname = usePathname();
  const { user, isAdmin, refreshStorageUsage } = useAuth();
  const { startNavigation } = useNavigation();
  const isCompose = pathname === '/mail/compose';
  const isContacts = pathname?.startsWith('/mail/contacts');
  const isCalendar = pathname?.startsWith('/mail/calendar');
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  // 상위 메뉴 펼침/접힘 상태 (초기값: 현재 경로에 따라 한쪽만 활성화)
  const [mailExpanded, setMailExpanded] = React.useState<boolean>(!isContacts && !isCalendar);
  const [contactsExpanded, setContactsExpanded] = React.useState<boolean>(Boolean(isContacts));
  const [calendarExpanded, setCalendarExpanded] = React.useState<boolean>(Boolean(isCalendar));
  const [groups, setGroups] = React.useState<ContactGroupDto[]>([]);
  const [calendars, setCalendars] = React.useState<CalendarDto[]>([]);

  React.useEffect(() => {
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

  // 주소록 그룹 목록 로드
  const loadSidebarGroups = async () => {
    try {
      const data = await contactsApi.getGroups();
      setGroups(data || []);
    } catch {
      // ignore
    }
  };

  // 캘린더 목록 로드
  const loadSidebarCalendars = async () => {
    try {
      const data = await calendarApi.getCalendars();
      setCalendars(data || []);
    } catch {
      // ignore
    }
  };

  React.useEffect(() => {
    loadSidebarGroups();
    loadSidebarCalendars();
    const handleRefreshGroups = () => loadSidebarGroups();
    const handleRefreshCalendars = () => loadSidebarCalendars();
    window.addEventListener('contacts:refresh-groups', handleRefreshGroups);
    window.addEventListener('calendar:refresh', handleRefreshCalendars);
    return () => {
      window.removeEventListener('contacts:refresh-groups', handleRefreshGroups);
      window.removeEventListener('calendar:refresh', handleRefreshCalendars);
    };
  }, []);

  const handleRefreshQuota = async () => {
    setIsRefreshing(true);
    try {
      await refreshStorageUsage?.();
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  const quotaMb = user?.mailboxQuotaMb ?? 512;
  const usedMb = user?.usedMb ?? 0;
  const usagePercent =
    user?.usagePercent ??
    (quotaMb > 0 ? Math.min(100, Math.round((usedMb / quotaMb) * 100)) : 100);
  const messageCount = user?.messageCount ?? 0;
  const freeMb = Math.max(0, Math.round((quotaMb - usedMb) * 10) / 10);

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-30 w-64 bg-slate-900 text-slate-300 border-r border-slate-800 transition-all duration-300 ease-in-out lg:static lg:translate-x-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      {/* Brand Header */}
      <div className="flex h-16 items-center justify-between border-b border-slate-800 px-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500 text-white shadow-md shadow-sky-500/30">
            <Mail className="h-5 w-5" />
          </div>
          <div>
            <span className="text-base font-bold tracking-tight text-white">LEMail</span>
            <span className="ml-1.5 rounded bg-sky-950 px-1.5 py-0.5 text-[10px] font-semibold text-sky-400 border border-sky-800">
              Webmail
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-col justify-between h-[calc(100vh-4rem)] overflow-y-auto px-4 py-5">
        <div className="space-y-4">
          {/* Compose Mail Button */}
          <div>
            <Link
              href="/mail/compose"
              onClick={() => {
                setSidebarOpen(false);
                startNavigation('/mail/compose');
              }}
              onMouseDown={() => startNavigation('/mail/compose')}
              className={`flex items-center justify-center gap-2.5 w-full py-2.5 px-4 rounded-xl font-semibold text-sm shadow-md transition-all duration-150 ${
                isCompose
                  ? 'bg-sky-500 text-white shadow-sky-500/30 ring-2 ring-sky-400'
                  : 'bg-gradient-to-r from-sky-500 to-sky-600 text-white shadow-sky-950/40 hover:from-sky-400 hover:to-sky-500 hover:shadow-sky-500/20 active:scale-[0.98]'
              }`}
            >
              <PenSquare className="h-4 w-4" />
              <span>메일 쓰기</span>
            </Link>
          </div>

          {/* Admin Switcher (관리자일 때만 노출) */}
          {isAdmin && (
            <div>
              <Link
                href="/admin/dashboard"
                onClick={() => {
                  setSidebarOpen(false);
                  startNavigation('/admin/dashboard');
                }}
                onMouseDown={() => startNavigation('/admin/dashboard')}
                className="flex items-center justify-between w-full rounded-xl bg-indigo-950/60 border border-indigo-800/80 px-3 py-2 text-xs font-semibold text-indigo-300 hover:bg-indigo-900 hover:text-white transition-all shadow-sm group"
              >
                <div className="flex items-center gap-2">
                  <Shield className="h-3.5 w-3.5 text-indigo-400" />
                  <span>관리자 콘솔로 전환</span>
                </div>
                <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform text-indigo-400" />
              </Link>
            </div>
          )}

          {/* 1. 메일 상위 메뉴 및 하위 편지함 */}
          <div className="space-y-1">
            <button
              type="button"
              onClick={handleToggleMail}
              className="flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-white hover:bg-slate-800/60 transition group"
            >
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-sky-400" />
                <span>메일함</span>
              </div>
              <ChevronDown
                className={`h-3.5 w-3.5 text-slate-500 group-hover:text-slate-300 transition-transform duration-200 ${
                  mailExpanded ? 'rotate-0' : '-rotate-90'
                }`}
              />
            </button>

            {mailExpanded && (
              <div className="pl-1 pt-0.5 animate-fadeIn">
                <MailFolderTree onSelectFolder={() => setSidebarOpen(false)} />
              </div>
            )}
          </div>

          {/* 2. 주소록 상위 메뉴 및 하위 주소록 메뉴 */}
          <div className="space-y-1 pt-2 border-t border-slate-700/80">
            <button
              type="button"
              onClick={handleToggleContacts}
              className="flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-white hover:bg-slate-800/60 transition group"
            >
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-emerald-400" />
                <span>주소록</span>
              </div>
              <ChevronDown
                className={`h-3.5 w-3.5 text-slate-500 group-hover:text-slate-300 transition-transform duration-200 ${
                  contactsExpanded ? 'rotate-0' : '-rotate-90'
                }`}
              />
            </button>

            {contactsExpanded && (
              <div className="space-y-0.5 pl-2 pt-0.5 animate-fadeIn text-xs">
                {/* 전체 주소록 */}
                <Link
                  href="/mail/contacts"
                  onClick={() => {
                    setSidebarOpen(false);
                    startNavigation('/mail/contacts');
                  }}
                  className={`flex items-center justify-between px-3 py-1.5 rounded-lg font-medium transition ${
                    pathname === '/mail/contacts'
                      ? 'bg-slate-800 text-white font-semibold'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Users className="h-3.5 w-3.5 text-slate-400" />
                    <span>전체 연락처</span>
                  </div>
                </Link>

                {/* 중요 연락처 */}
                <Link
                  href="/mail/contacts?groupId=starred"
                  onClick={() => {
                    setSidebarOpen(false);
                    startNavigation('/mail/contacts?groupId=starred');
                  }}
                  className={`flex items-center justify-between px-3 py-1.5 rounded-lg font-medium transition text-slate-400 hover:text-white hover:bg-slate-800/50`}
                >
                  <div className="flex items-center gap-2">
                    <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400/30" />
                    <span>중요 연락처</span>
                  </div>
                </Link>

                {/* 사내 임직원 주소록 */}
                <Link
                  href="/mail/contacts?groupId=company"
                  onClick={() => {
                    setSidebarOpen(false);
                    startNavigation('/mail/contacts?groupId=company');
                  }}
                  className={`flex items-center justify-between px-3 py-1.5 rounded-lg font-medium transition text-slate-400 hover:text-white hover:bg-slate-800/50`}
                >
                  <div className="flex items-center gap-2">
                    <Building2 className="h-3.5 w-3.5 text-sky-400" />
                    <span>사내 임직원</span>
                  </div>
                </Link>

                {/* 미지정 (개인 주소록) */}
                <Link
                  href="/mail/contacts?groupId=ungrouped"
                  onClick={() => {
                    setSidebarOpen(false);
                    startNavigation('/mail/contacts?groupId=ungrouped');
                  }}
                  className={`flex items-center justify-between px-3 py-1.5 rounded-lg font-medium transition text-slate-400 hover:text-white hover:bg-slate-800/50`}
                >
                  <div className="flex items-center gap-2">
                    <UserCheck className="h-3.5 w-3.5 text-slate-400" />
                    <span>미분류 연락처</span>
                  </div>
                </Link>

                {/* 사용자 정의 그룹 목록 */}
                {groups.length > 0 && (
                  <div className="pt-1.5 mt-1 border-t border-slate-800/60">
                    <div className="px-3 py-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                      그룹
                    </div>
                    {groups.map((g) => (
                      <Link
                        key={g.id}
                        href={`/mail/contacts?groupId=${g.id}`}
                        onClick={() => {
                          setSidebarOpen(false);
                          startNavigation(`/mail/contacts?groupId=${g.id}`);
                        }}
                        className="flex items-center justify-between px-3 py-1.5 rounded-lg font-medium transition text-slate-400 hover:text-white hover:bg-slate-800/50"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: g.color || '#0284c7' }}
                          />
                          <span className="truncate">{g.name}</span>
                        </div>
                        {g.contactCount !== undefined && g.contactCount > 0 && (
                          <span className="text-[10px] text-slate-500 font-mono">
                            {g.contactCount}
                          </span>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 3. 캘린더 상위 메뉴 및 하위 캘린더 메뉴 */}
          <div className="space-y-1 pt-2 border-t border-slate-700/80">
            <button
              type="button"
              onClick={handleToggleCalendar}
              className="flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-white hover:bg-slate-800/60 transition group"
            >
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-violet-400" />
                <span>캘린더</span>
              </div>
              <ChevronDown
                className={`h-3.5 w-3.5 text-slate-500 group-hover:text-slate-300 transition-transform duration-200 ${
                  calendarExpanded ? 'rotate-0' : '-rotate-90'
                }`}
              />
            </button>

            {calendarExpanded && (
              <div className="space-y-0.5 pl-2 pt-0.5 animate-fadeIn text-xs">
                <Link
                  href="/mail/calendar"
                  onClick={() => {
                    setSidebarOpen(false);
                    startNavigation('/mail/calendar');
                  }}
                  className={`flex items-center justify-between px-3 py-1.5 rounded-lg font-medium transition ${
                    pathname === '/mail/calendar'
                      ? 'bg-slate-800 text-white font-semibold'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                    <span>전체 일정</span>
                  </div>
                </Link>

                <Link
                  href="/mail/calendar?view=day"
                  onClick={() => {
                    setSidebarOpen(false);
                    startNavigation('/mail/calendar?view=day');
                  }}
                  className="flex items-center justify-between px-3 py-1.5 rounded-lg font-medium transition text-slate-400 hover:text-white hover:bg-slate-800/50"
                >
                  <div className="flex items-center gap-2">
                    <CalendarClock className="h-3.5 w-3.5 text-sky-400" />
                    <span>오늘 일정</span>
                  </div>
                </Link>

                {calendars.length > 0 && (
                  <div className="pt-1.5 mt-1 border-t border-slate-800/60">
                    <div className="px-3 py-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                      내 캘린더
                    </div>
                    {calendars.map((cal) => (
                      <Link
                        key={cal.id}
                        href={`/mail/calendar?calendarId=${cal.id}`}
                        onClick={() => {
                          setSidebarOpen(false);
                          startNavigation(`/mail/calendar?calendarId=${cal.id}`);
                        }}
                        className="flex items-center justify-between px-3 py-1.5 rounded-lg font-medium transition text-slate-400 hover:text-white hover:bg-slate-800/50"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: cal.color || '#0284c7' }}
                          />
                          <span className="truncate">{cal.name}</span>
                        </div>
                        {!cal.isVisible && (
                          <span className="text-[10px] text-slate-500">숨김</span>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* User Settings */}
          <div className="pt-2 border-t border-slate-700/80">
            <Link
              href="/mail/settings"
              onClick={() => {
                setSidebarOpen(false);
                startNavigation('/mail/settings');
              }}
              onMouseDown={() => startNavigation('/mail/settings')}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition group ${
                pathname === '/mail/settings'
                  ? 'bg-slate-800 text-white font-semibold'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Settings className="h-4 w-4 text-slate-500 group-hover:text-sky-400 transition" />
              <span>환경설정</span>
            </Link>
          </div>
        </div>

        {/* User Quota / Storage Footer */}
        <div className="rounded-xl bg-slate-800/80 p-3.5 border border-slate-700/60 text-xs shadow-inner">
          <div className="flex items-center justify-between text-slate-200 font-medium mb-1.5">
            <span className="flex items-center gap-1.5 font-semibold text-slate-200">
              <HardDrive className="h-3.5 w-3.5 text-sky-400" />
              <span>메일함 스토리지</span>
            </span>
            <span
              className={`text-[11px] font-bold font-mono ${
                usagePercent >= 90
                  ? 'text-rose-400'
                  : usagePercent >= 70
                  ? 'text-amber-400'
                  : 'text-sky-400'
              }`}
            >
              {usagePercent}%
            </span>
          </div>

          {/* 게이지 바 */}
          <div className="h-1.5 w-full bg-slate-700/80 rounded-full overflow-hidden mb-2">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                usagePercent >= 90
                  ? 'bg-rose-500'
                  : usagePercent >= 70
                  ? 'bg-amber-500'
                  : 'bg-gradient-to-r from-sky-400 to-sky-500'
              }`}
              style={{
                width: `${Math.min(100, Math.max(usedMb > 0 ? 2 : 0, usagePercent))}%`,
              }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
            <span>
              <strong className="text-slate-200 font-semibold">{usedMb} MB</strong> / {quotaMb} MB
            </span>
            <span>{freeMb} MB 남음</span>
          </div>

          <div className="mt-2 pt-2 border-t border-slate-700/50 flex items-center justify-between text-[10px] text-slate-400">
            <span>메일 {messageCount.toLocaleString()}통 보관 중</span>
            <button
              type="button"
              onClick={handleRefreshQuota}
              disabled={isRefreshing}
              title="스토리지 사용량 새로고침"
              className="p-1 rounded hover:bg-slate-700/50 text-slate-400 hover:text-sky-400 transition"
            >
              <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin text-sky-400' : ''}`} />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};
