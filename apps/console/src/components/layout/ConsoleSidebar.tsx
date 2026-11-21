'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useNavigation } from '../../contexts/NavigationContext';
import { useAuth } from '../../contexts/AuthContext';
import { formatBrandName } from '@lemail/shared-types';
import {
  Activity,
  UserCog,
  Mail,
  Globe,
  Layers,
  ShieldCheck,
  ShieldAlert,
  Filter,
  ExternalLink,
  Settings,
  KeyRound,
  CalendarDays,
  Building2,
} from 'lucide-react';

interface ConsoleSidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

const WEBMAIL_URL = (process.env.NEXT_PUBLIC_WEBMAIL_URL || '').trim();

export const ConsoleSidebar: React.FC<ConsoleSidebarProps> = ({
  sidebarOpen,
  setSidebarOpen,
}) => {
  const pathname = usePathname();
  const { startNavigation } = useNavigation();
  const { licenseStatus } = useAuth();
  const brandName = formatBrandName(licenseStatus);

  const isLinkActive = (path: string) => {
    return pathname === path || pathname?.startsWith(`${path}/`);
  };

  const navItems = [
    {
      href: '/dashboard',
      label: '모니터링 대시보드',
      icon: Activity,
    },
    {
      href: '/users',
      label: '사용자 계정 관리',
      icon: UserCog,
    },
    {
      href: '/org',
      label: '조직도 및 AMS 연동',
      icon: Building2,
    },
    {
      href: '/domains',
      label: '도메인 관리',
      icon: Globe,
    },
    {
      href: '/mailboxes',
      label: '사서함 관리',
      icon: Mail,
    },
    {
      href: '/logs',
      label: '수신 및 보안 로그',
      icon: Layers,
    },
    {
      href: '/quarantine',
      label: '스팸 격리함 관리',
      icon: ShieldAlert,
    },
    {
      href: '/spam-rules',
      label: '스팸 차단 및 필터 정책',
      icon: Filter,
    },
    {
      href: '/settings',
      label: '시스템 환경설정',
      icon: Settings,
    },
    {
      href: '/holidays',
      label: '공휴일 관리',
      icon: CalendarDays,
    },
    {
      href: '/license',
      label: '라이선스 관리',
      icon: KeyRound,
    },
  ];

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
        <div className="flex-1 min-h-0 overflow-y-auto space-y-3.5 pr-0.5">
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

          {/* Admin Navigation */}
          <div>
            <div className="px-2.5 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#86868b]">
              시스템 관리 콘솔
            </div>
            <nav className="space-y-0.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = isLinkActive(item.href);
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
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      </div>
    </aside>
  );
};
