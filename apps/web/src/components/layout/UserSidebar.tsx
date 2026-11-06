'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { MailFolderTree } from '../mail/MailFolderTree';
import { Mail, Shield, ArrowRight, PenSquare } from 'lucide-react';

interface UserSidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

export const UserSidebar: React.FC<UserSidebarProps> = ({
  sidebarOpen,
  setSidebarOpen,
}) => {
  const pathname = usePathname();
  const { isAdmin } = useAuth();
  const isCompose = pathname === '/mail/compose';

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
              onClick={() => setSidebarOpen(false)}
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
                onClick={() => setSidebarOpen(false)}
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

          {/* User Mail Folders (기본 편지함 6종 및 계층형 트리) */}
          <div>
            <MailFolderTree onSelectFolder={() => setSidebarOpen(false)} />
          </div>
        </div>

        {/* User Quota / Helper Footer */}
        <div className="rounded-xl bg-slate-800/60 p-3 border border-slate-800 text-xs">
          <div className="flex items-center justify-between text-slate-300 font-medium mb-1">
            <span>메일함 스토리지</span>
            <span className="text-sky-400 text-[11px]">무제한</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            LEMail 온프레미스 고성능 엔터프라이즈 사서함
          </p>
        </div>
      </div>
    </aside>
  );
};
