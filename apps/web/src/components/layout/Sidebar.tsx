'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Inbox,
  Send,
  Trash2,
  Users,
  UserCog,
  Activity,
  ShieldCheck,
  Settings,
  Mail,
  Server,
  Layers,
} from 'lucide-react';

interface SidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ sidebarOpen, setSidebarOpen }) => {
  const pathname = usePathname();

  const isLinkActive = (path: string) => {
    return pathname === path || pathname?.startsWith(`${path}/`);
  };

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-30 w-64 bg-slate-900 text-slate-300 transition-all duration-300 ease-in-out lg:static lg:translate-x-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      {/* Brand Header */}
      <div className="flex h-16 items-center gap-3 border-b border-slate-800 px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-500 text-white shadow-md shadow-sky-500/30">
          <Mail className="h-5 w-5" />
        </div>
        <div>
          <span className="text-lg font-bold tracking-tight text-white">LEMail</span>
          <span className="ml-2 rounded bg-sky-950 px-1.5 py-0.5 text-[10px] font-semibold text-sky-400 border border-sky-800">
            Enterprise
          </span>
        </div>
      </div>

      <div className="flex flex-col justify-between h-[calc(100vh-4rem)] overflow-y-auto px-4 py-6">
        <div className="space-y-6">
          {/* User Section (Webmail) */}
          <div>
            <div className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Webmail (사용자)
            </div>
            <nav className="space-y-1">
              <Link
                href="/mail/inbox"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isLinkActive('/mail/inbox')
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Inbox className="h-4 w-4" />
                <span>받은편지함</span>
              </Link>

              <Link
                href="/mail/sent"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isLinkActive('/mail/sent')
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Send className="h-4 w-4" />
                <span>보낸편지함</span>
              </Link>

              <Link
                href="/mail/trash"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isLinkActive('/mail/trash')
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Trash2 className="h-4 w-4" />
                <span>휴지통</span>
              </Link>
            </nav>
          </div>

          {/* Admin Section */}
          <div>
            <div className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Management (관리자)
            </div>
            <nav className="space-y-1">
              <Link
                href="/admin/dashboard"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isLinkActive('/admin/dashboard')
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Activity className="h-4 w-4" />
                <span>모니터링 대시보드</span>
              </Link>

              <Link
                href="/admin/users"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isLinkActive('/admin/users')
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <UserCog className="h-4 w-4" />
                <span>사용자 계정 관리</span>
              </Link>

              <Link
                href="/admin/mailboxes"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isLinkActive('/admin/mailboxes')
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Mail className="h-4 w-4" />
                <span>사서함/도메인 관리</span>
              </Link>

              <Link
                href="/admin/logs"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isLinkActive('/admin/logs')
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Layers className="h-4 w-4" />
                <span>수신 및 보안 로그</span>
              </Link>
            </nav>
          </div>
        </div>

        {/* Server Status Footer */}
        <div className="rounded-lg bg-slate-800/80 p-3 border border-slate-700/50">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
            </span>
            <span className="text-xs font-semibold text-slate-200">SMTP Server Ready</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Port 2525 (Spool Active)</p>
        </div>
      </div>
    </aside>
  );
};
