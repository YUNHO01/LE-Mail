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
  ArrowLeft,
  Server,
  Settings,
  KeyRound,
  CalendarDays,
  Building2,
} from 'lucide-react';

interface AdminSidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
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
      href: '/admin/dashboard',
      label: '모니터링 대시보드',
      icon: Activity,
    },
    {
      href: '/admin/users',
      label: '사용자 계정 관리',
      icon: UserCog,
    },
    {
      href: '/admin/org',
      label: '조직도 및 AMS 연동',
      icon: Building2,
    },
    {
      href: '/admin/domains',
      label: '도메인 관리',
      icon: Globe,
    },
    {
      href: '/admin/mailboxes',
      label: '사서함 관리',
      icon: Mail,
    },
    {
      href: '/admin/logs',
      label: '수신 및 보안 로그',
      icon: Layers,
    },
    {
      href: '/admin/quarantine',
      label: '스팸 격리함 관리',
      icon: ShieldAlert,
    },
    {
      href: '/admin/spam-rules',
      label: '스팸 차단 및 필터 정책',
      icon: Filter,
    },
    {
      href: '/admin/settings',
      label: '시스템 환경설정',
      icon: Settings,
    },
    {
      href: '/admin/holidays',
      label: '공휴일 관리',
      icon: CalendarDays,
    },
    {
      href: '/admin/license',
      label: '라이선스 관리',
      icon: KeyRound,
    },
  ];

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-30 w-64 bg-slate-950 text-slate-300 border-r border-slate-800 transition-all duration-300 ease-in-out lg:static lg:translate-x-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      {/* Brand Header */}
      <div className="flex h-16 items-center justify-between border-b border-slate-800/80 px-5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-md shadow-indigo-600/30">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className="text-base font-bold tracking-tight text-white truncate"
              title={brandName}
            >
              {brandName}
            </span>
            <span className="shrink-0 rounded bg-indigo-950 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-400 border border-indigo-800">
              Admin
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-col justify-between h-[calc(100vh-4rem)] overflow-y-auto px-4 py-5">
        <div className="space-y-6">
          {/* Quick Switch to User Webmail */}
          <div>
            <Link
              href="/mail/inbox"
              onClick={() => {
                setSidebarOpen(false);
                startNavigation('/mail/inbox');
              }}
              onMouseDown={() => startNavigation('/mail/inbox')}
              className="flex items-center justify-center gap-2 w-full rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition-all shadow-sm group"
            >
              <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform text-sky-400" />
              <span>사용자 웹메일로 이동</span>
            </Link>
          </div>

          {/* Admin Navigation */}
          <div>
            <div className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              시스템 관리 콘솔
            </div>
            <nav className="space-y-1">
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
                    className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors ${
                      active
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                        : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${active ? 'text-white' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Server Status Footer */}
        <div className="rounded-xl bg-slate-900/90 p-3.5 border border-slate-800">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
            </span>
            <span className="text-xs font-semibold text-slate-200">SMTP Core Engine</span>
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400">
            <span>Port 2525</span>
            <span className="rounded bg-emerald-950 px-1 py-0.2 text-[10px] text-emerald-400 border border-emerald-800">
              Healthy
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
};
