'use client';

import React from 'react';
import { Menu, ExternalLink, LogOut, LogIn } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import Link from 'next/link';

interface ConsoleHeaderProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

export const ConsoleHeader: React.FC<ConsoleHeaderProps> = ({ sidebarOpen, setSidebarOpen }) => {
  const { user, isAuthenticated, logout } = useAuth();

  return (
    <header className="sticky top-0 z-20 flex h-12 w-full shrink-0 items-center justify-between border-b border-black/[0.08] bg-[#f5f5f7]/90 backdrop-blur-xl px-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="rounded-lg p-1.5 text-[#1d1d1f] hover:bg-black/[0.05] lg:hidden"
          aria-label="Toggle Sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      <div className="flex items-center gap-2.5">
        <a
          href="/api/docs"
          target="_blank"
          rel="noreferrer"
          className="hidden sm:flex items-center gap-1.5 rounded-full bg-white border border-black/[0.08] px-3 py-1 text-[11px] font-medium text-[#1d1d1f] hover:bg-black/[0.03] transition"
        >
          <span>Swagger Docs</span>
          <ExternalLink className="h-3 w-3 text-[#86868b]" />
        </a>

        {isAuthenticated && user ? (
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-2 p-1">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0071e3] text-[11px] font-bold text-white uppercase shadow-xs">
                {user.name ? user.name.slice(0, 2) : 'AD'}
              </div>
              <div className="hidden text-left lg:block leading-tight">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-[#1d1d1f]">{user.name}</span>
                  <span className="rounded-md bg-[#0071e3]/10 px-1.5 py-0.2 text-[10px] font-semibold text-[#0071e3] border border-[#0071e3]/20">
                    관리자
                  </span>
                </div>
                <div className="text-[11px] text-[#86868b]">{user.email}</div>
              </div>
            </div>

            <button
              onClick={logout}
              title="로그아웃"
              aria-label="로그아웃"
              className="rounded-lg p-1.5 text-[#86868b] hover:bg-black/[0.05] hover:text-[#1d1d1f] transition"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <Link
            href="/login"
            className="flex items-center gap-1.5 rounded-lg bg-[#0071e3] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#0077ed] transition shadow-sm"
          >
            <LogIn className="h-3.5 w-3.5" />
            <span>로그인</span>
          </Link>
        )}
      </div>
    </header>
  );
};
