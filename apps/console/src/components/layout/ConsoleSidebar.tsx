'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useNavigation } from '../../contexts/NavigationContext';
import { useAuth } from '../../contexts/AuthContext';
import { formatBrandName } from '@lemail/shared-types';
import { ShieldCheck, ExternalLink, ChevronDown } from 'lucide-react';
import {
  CONSOLE_TOP_ITEMS,
  CONSOLE_NAV_GROUPS,
  type ConsoleNavItem,
} from '../../config/navigation';

interface ConsoleSidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

const WEBMAIL_URL = (process.env.NEXT_PUBLIC_WEBMAIL_URL || '').trim();

function isPathActive(pathname: string | null, href: string): boolean {
  return pathname === href || Boolean(pathname?.startsWith(`${href}/`));
}

function findActiveGroupId(pathname: string | null): string | null {
  const matched = CONSOLE_NAV_GROUPS.find((group) =>
    group.items.some((item) => isPathActive(pathname, item.href)),
  );
  return matched ? matched.id : null;
}

export const ConsoleSidebar: React.FC<ConsoleSidebarProps> = ({
  sidebarOpen,
  setSidebarOpen,
}) => {
  const pathname = usePathname();
  const router = useRouter();
  const { startNavigation } = useNavigation();
  const { licenseStatus } = useAuth();
  const brandName = formatBrandName(licenseStatus);

  // 아코디언 상태: 현재 선택된 그룹 1개만 펼치고 나머지는 닫힘
  const [openGroupId, setOpenGroupId] = useState<string | null>(() =>
    findActiveGroupId(pathname),
  );

  // 경로 변경 시 해당 메뉴가 속한 그룹만 열고 나머지는 닫음
  useEffect(() => {
    setOpenGroupId(findActiveGroupId(pathname));
  }, [pathname]);

  const toggleGroup = (groupId: string) => {
    const willOpen = openGroupId !== groupId;
    setOpenGroupId(willOpen ? groupId : null);

    if (willOpen) {
      const targetGroup = CONSOLE_NAV_GROUPS.find((g) => g.id === groupId);
      const firstItem = targetGroup?.items[0];
      if (firstItem) {
        setSidebarOpen(false);
        startNavigation(firstItem.href);
        router.push(firstItem.href);
      }
    }
  };

  const renderNavLink = (item: ConsoleNavItem) => {
    const Icon = item.icon;
    const active = isPathActive(pathname, item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => {
          setSidebarOpen(false);
          startNavigation(item.href);
        }}
        onMouseDown={() => startNavigation(item.href)}
        className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium transition-colors ${
          active
            ? 'bg-[#007aff]/12 text-[#0071e3] font-semibold'
            : 'text-[#1d1d1f] hover:bg-black/[0.04]'
        }`}
      >
        <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-[#0071e3]' : 'text-[#6e6e73]'}`} />
        <span className="truncate flex-1">{item.label}</span>
        {item.badge && (
          <span className="shrink-0 rounded-full bg-black/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-[#6e6e73]">
            {item.badge}
          </span>
        )}
      </Link>
    );
  };

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-30 w-60 flex flex-col bg-[#f5f5f7] text-[#1d1d1f] border-r border-black/[0.08] transition-all duration-300 ease-in-out lg:static lg:translate-x-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      {/* Brand Header (웹메일 UserSidebar와 동일한 48px 규격) */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-black/[0.08] px-4">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-b from-[#2997ff] to-[#0071e3] text-white shadow-xs">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className="text-[15px] font-semibold tracking-tight text-[#1d1d1f] truncate"
              title={brandName}
            >
              {brandName}
            </span>
            <span className="shrink-0 rounded-md bg-black/[0.05] px-1.5 py-0.5 text-[10px] font-medium text-[#6e6e73]">
              Admin
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-col flex-1 min-h-0 justify-between px-3 py-3">
        <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-0.5">
          {/* Optional External Link to User Webmail */}
          {WEBMAIL_URL && (
            <div>
              <a
                href={WEBMAIL_URL}
                target="_blank"
                rel="noreferrer"
                onClick={() => setSidebarOpen(false)}
                className="flex items-center justify-center gap-2 w-full rounded-xl bg-white border border-black/[0.08] px-3 py-2 text-xs font-medium text-[#1d1d1f] hover:bg-black/[0.03] transition-all shadow-xs group"
              >
                <span>사용자 웹메일 열기</span>
                <ExternalLink className="h-3.5 w-3.5 text-[#0071e3]" />
              </a>
            </div>
          )}

          {/* 상단 고정 메뉴 */}
          {CONSOLE_TOP_ITEMS.length > 0 && (
            <nav className="space-y-0.5">{CONSOLE_TOP_ITEMS.map(renderNavLink)}</nav>
          )}

          {/* 그룹별 Admin Navigation (아코디언 토글) */}
          <div className="space-y-1.5 pt-1.5 border-t border-black/[0.06]">
            {CONSOLE_NAV_GROUPS.map((group) => {
              const isOpen = openGroupId === group.id;
              const hasActiveItem = group.items.some((item) => isPathActive(pathname, item.href));

              return (
                <div key={group.id} className="space-y-0.5">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    aria-expanded={isOpen}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                      isOpen || hasActiveItem
                        ? 'text-[#1d1d1f] hover:bg-black/[0.04]'
                        : 'text-[#86868b] hover:bg-black/[0.04] hover:text-[#1d1d1f]'
                    }`}
                  >
                    <span className="truncate">{group.label}</span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${
                        isOpen ? 'rotate-0' : '-rotate-90'
                      }`}
                    />
                  </button>

                  {isOpen && <nav className="space-y-0.5">{group.items.map(renderNavLink)}</nav>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </aside>
  );
};
