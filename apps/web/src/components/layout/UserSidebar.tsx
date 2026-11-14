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
import { ContactGroupDto, CalendarDto, formatBrandName } from '@lemail/shared-types';

interface UserSidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

export const UserSidebar: React.FC<UserSidebarProps> = ({
  sidebarOpen,
  setSidebarOpen,
}) => {
  const pathname = usePathname();
  const { user, isAdmin, refreshStorageUsage, licenseStatus } = useAuth();
  const brandName = formatBrandName(licenseStatus);
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
      className={`fixed inset-y-0 left-0 z-30 w-60 bg-[#f5f5f7] text-[#1d1d1f] border-r border-black/[0.08] transition-all duration-300 ease-in-out lg:static lg:translate-x-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      {/* Brand Header */}
      <div className="flex h-12 items-center justify-between border-b border-black/[0.08] px-4">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-b from-[#2997ff] to-[#0071e3] text-white shadow-xs">
            <Mail className="h-4 w-4" />
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className="text-[15px] font-semibold tracking-tight text-[#1d1d1f] truncate"
              title={brandName}
            >
              {brandName}
            </span>
            <span className="shrink-0 rounded-md bg-black/[0.05] px-1.5 py-0.5 text-[10px] font-medium text-[#6e6e73]">
              Webmail
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-col justify-between h-[calc(100vh-3rem)] overflow-y-auto px-3 py-3.5">
        <div className="space-y-3.5">
          {/* Compose Mail Button */}
          <div>
            <Link
              href="/mail/compose"
              onClick={() => {
                setSidebarOpen(false);
                startNavigation('/mail/compose');
              }}
              onMouseDown={() => startNavigation('/mail/compose')}
              className={`flex items-center justify-center gap-2 w-full py-2 px-3.5 rounded-xl font-medium text-[13px] shadow-xs transition-all duration-150 ${
                isCompose
                  ? 'bg-[#0071e3] text-white ring-2 ring-[#0071e3]/30'
                  : 'bg-[#0071e3] text-white hover:bg-[#0077ed] active:scale-[0.98]'
              }`}
            >
              <PenSquare className="h-4 w-4" />
              <span>메일 쓰기</span>
            </Link>
          </div>

          {/* Admin Switcher (관리자일 때만 노출) */}
          {isAdmin && (
            <div className="lg:hidden">
              <Link
                href="/admin/dashboard"
                onClick={() => {
                  setSidebarOpen(false);
                  startNavigation('/admin/dashboard');
                }}
                onMouseDown={() => startNavigation('/admin/dashboard')}
                className="flex items-center justify-between w-full rounded-xl bg-white border border-black/[0.08] px-3 py-2 text-xs font-medium text-[#1d1d1f] hover:bg-black/[0.03] transition-all group"
              >
                <div className="flex items-center gap-2">
                  <Shield className="h-3.5 w-3.5 text-[#0071e3]" />
                  <span>관리자 콘솔로 전환</span>
                </div>
                <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform text-[#86868b]" />
              </Link>
            </div>
          )}

          {/* 1. 메일 상위 메뉴 및 하위 편지함 */}
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
              <div className="pt-0.5 animate-fadeIn">
                <MailFolderTree onSelectFolder={() => setSidebarOpen(false)} />
              </div>
            )}
          </div>

          {/* 2. 주소록 상위 메뉴 및 하위 주소록 메뉴 */}
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
              <div className="space-y-0.5 pl-1 pt-0.5 animate-fadeIn text-xs">
                {/* 전체 주소록 */}
                <Link
                  href="/mail/contacts"
                  onClick={() => {
                    setSidebarOpen(false);
                    startNavigation('/mail/contacts');
                  }}
                  className={`flex items-center justify-between px-3 py-1.5 rounded-lg font-medium transition ${
                    pathname === '/mail/contacts'
                      ? 'bg-[#007aff]/12 text-[#0071e3] font-semibold'
                      : 'text-[#1d1d1f] hover:bg-black/[0.04]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Users className="h-3.5 w-3.5 text-[#6e6e73]" />
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
                  className="flex items-center justify-between px-3 py-1.5 rounded-lg font-medium transition text-[#1d1d1f] hover:bg-black/[0.04]"
                >
                  <div className="flex items-center gap-2">
                    <Star className="h-3.5 w-3.5 text-[#ff9500] fill-[#ff9500]/20" />
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
                  className="flex items-center justify-between px-3 py-1.5 rounded-lg font-medium transition text-[#1d1d1f] hover:bg-black/[0.04]"
                >
                  <div className="flex items-center gap-2">
                    <Building2 className="h-3.5 w-3.5 text-[#0071e3]" />
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
                  className="flex items-center justify-between px-3 py-1.5 rounded-lg font-medium transition text-[#1d1d1f] hover:bg-black/[0.04]"
                >
                  <div className="flex items-center gap-2">
                    <UserCheck className="h-3.5 w-3.5 text-[#6e6e73]" />
                    <span>미분류 연락처</span>
                  </div>
                </Link>

                {/* 사용자 정의 그룹 목록 */}
                {groups.length > 0 && (
                  <div className="pt-1.5 mt-1 border-t border-black/[0.06]">
                    <div className="px-3 py-1 text-[10px] font-semibold text-[#86868b] uppercase tracking-wider">
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
                        className="flex items-center justify-between px-3 py-1.5 rounded-lg font-medium transition text-[#1d1d1f] hover:bg-black/[0.04]"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: g.color || '#0071e3' }}
                          />
                          <span className="truncate">{g.name}</span>
                        </div>
                        {g.contactCount !== undefined && g.contactCount > 0 && (
                          <span className="text-[10px] text-[#86868b] tabular-nums">
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
              <div className="space-y-0.5 pl-1 pt-0.5 animate-fadeIn text-xs">
                <Link
                  href="/mail/calendar"
                  onClick={() => {
                    setSidebarOpen(false);
                    startNavigation('/mail/calendar');
                  }}
                  className={`flex items-center justify-between px-3 py-1.5 rounded-lg font-medium transition ${
                    pathname === '/mail/calendar'
                      ? 'bg-[#007aff]/12 text-[#0071e3] font-semibold'
                      : 'text-[#1d1d1f] hover:bg-black/[0.04]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-3.5 w-3.5 text-[#6e6e73]" />
                    <span>전체 일정</span>
                  </div>
                </Link>

                <Link
                  href="/mail/calendar?view=day"
                  onClick={() => {
                    setSidebarOpen(false);
                    startNavigation('/mail/calendar?view=day');
                  }}
                  className="flex items-center justify-between px-3 py-1.5 rounded-lg font-medium transition text-[#1d1d1f] hover:bg-black/[0.04]"
                >
                  <div className="flex items-center gap-2">
                    <CalendarClock className="h-3.5 w-3.5 text-[#0071e3]" />
                    <span>오늘 일정</span>
                  </div>
                </Link>

                {calendars.length > 0 && (
                  <div className="pt-1.5 mt-1 border-t border-black/[0.06]">
                    <div className="px-3 py-1 text-[10px] font-semibold text-[#86868b] uppercase tracking-wider">
                      내 캘린더
                    </div>
                    {calendars.map((cal) => {
                      const isOtherShared =
                        cal.type === 'SHARED' &&
                        Boolean(user?.id) &&
                        cal.userId !== user?.id &&
                        Boolean(cal.ownerName);

                      return (
                        <Link
                          key={cal.id}
                          href={`/mail/calendar?calendarId=${cal.id}`}
                          onClick={() => {
                            setSidebarOpen(false);
                            startNavigation(`/mail/calendar?calendarId=${cal.id}`);
                          }}
                          title={
                            isOtherShared
                              ? `${cal.name} (${cal.ownerName})`
                              : cal.name
                          }
                          className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg font-medium transition text-[#1d1d1f] hover:bg-black/[0.04]"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: cal.color || '#0071e3' }}
                            />
                            <span className="truncate">{cal.name}</span>
                          </div>
                          {isOtherShared && (
                            <span className="shrink-0 max-w-[64px] truncate text-[10px] text-[#86868b]">
                              {cal.ownerName}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* User Settings */}
          <div className="pt-2 border-t border-black/[0.06]">
            <Link
              href="/mail/settings"
              onClick={() => {
                setSidebarOpen(false);
                startNavigation('/mail/settings');
              }}
              onMouseDown={() => startNavigation('/mail/settings')}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition group ${
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

        {/* User Quota / Storage Footer */}
        <div className="rounded-xl bg-white/80 p-3 border border-black/[0.06] text-xs mt-4">
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

          {/* 게이지 바 */}
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
              title="스토리지 사용량 새로고침"
              className="p-1 rounded hover:bg-black/[0.05] text-[#86868b] hover:text-[#0071e3] transition"
            >
              <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin text-[#0071e3]' : ''}`} />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};
