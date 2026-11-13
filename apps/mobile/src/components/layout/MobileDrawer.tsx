'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { X, HardDrive, RefreshCw, LogOut, Settings, Users, Calendar } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigation } from '../../contexts/NavigationContext';
import { MailFolderTree } from '../mail/MailFolderTree';

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
}

export const MobileDrawer: React.FC<MobileDrawerProps> = ({ open, onClose }) => {
  const { user, logout, refreshStorageUsage } = useAuth();
  const { startNavigation } = useNavigation();
  const [isRefreshing, setIsRefreshing] = useState(false);

  if (!open) return null;

  const quotaMb = user?.mailboxQuotaMb ?? 512;
  const usedMb = user?.usedMb ?? 0;
  const usagePercent =
    user?.usagePercent ??
    (quotaMb > 0 ? Math.min(100, Math.round((usedMb / quotaMb) * 100)) : 100);

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

      {/* Drawer Panel */}
      <aside className="relative z-10 flex h-full w-72 max-w-[82vw] flex-col bg-white shadow-2xl">
        {/* User Profile Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-900">
              {user?.name || '사용자'}
            </p>
            <p className="truncate text-xs text-slate-500">{user?.email}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="메뉴 닫기"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Content: Mail Folders + Quick Links */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            메일함
          </div>
          <MailFolderTree onSelectFolder={onClose} />

          <div className="my-4 border-t border-slate-100" />

          <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            바로가기
          </div>
          <nav className="space-y-1">
            <Link
              href="/mail/contacts"
              onClick={() => {
                startNavigation('/mail/contacts');
                onClose();
              }}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              <Users className="h-4 w-4 text-slate-500" />
              <span>주소록</span>
            </Link>
            <Link
              href="/mail/calendar"
              onClick={() => {
                startNavigation('/mail/calendar');
                onClose();
              }}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              <Calendar className="h-4 w-4 text-slate-500" />
              <span>캘린더</span>
            </Link>
            <Link
              href="/mail/settings"
              onClick={() => {
                startNavigation('/mail/settings');
                onClose();
              }}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              <Settings className="h-4 w-4 text-slate-500" />
              <span>환경설정</span>
            </Link>
          </nav>
        </div>

        {/* Storage Quota & Logout */}
        <div className="border-t border-slate-100 bg-slate-50/70 p-4 space-y-3">
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-medium text-slate-600">
                <HardDrive className="h-3.5 w-3.5 text-sky-600" />
                사서함 용량
              </span>
              <button
                type="button"
                onClick={handleRefreshQuota}
                aria-label="용량 새로고침"
                className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
              >
                <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-sky-600 transition-all"
                style={{ width: `${Math.min(100, usagePercent)}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-slate-500">
              <span>{usedMb} MB 사용</span>
              <span>총 {quotaMb} MB ({usagePercent}%)</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              onClose();
              logout();
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            <LogOut className="h-3.5 w-3.5 text-slate-500" />
            <span>로그아웃</span>
          </button>
        </div>
      </aside>
    </div>
  );
};
