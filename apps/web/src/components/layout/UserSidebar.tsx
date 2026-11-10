'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { MailFolderTree } from '../mail/MailFolderTree';
import { Mail, Shield, ArrowRight, PenSquare, HardDrive, RefreshCw, ShieldBan } from 'lucide-react';

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
  const isCompose = pathname === '/mail/compose';
  const [isRefreshing, setIsRefreshing] = React.useState(false);

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
    (quotaMb > 0 ? Math.min(100, Math.round((usedMb / quotaMb) * 100)) : 0);
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

          {/* User Spam / Filter Settings */}
          <div className="pt-2 border-t border-slate-800">
            <Link
              href="/mail/settings"
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition group ${
                pathname === '/mail/settings'
                  ? 'bg-slate-800 text-white font-semibold'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <ShieldBan className="h-4 w-4 text-slate-500 group-hover:text-rose-400 transition" />
              <span>스팸 / 수신 차단 설정</span>
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
