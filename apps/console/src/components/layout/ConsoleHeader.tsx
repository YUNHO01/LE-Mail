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
    <header className="sticky top-0 z-20 flex h-16 w-full shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 shadow-sm">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden"
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
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <span>Swagger Docs</span>
          <ExternalLink className="h-3 w-3 text-slate-400" />
        </a>
        <div className="h-4 w-px bg-slate-200" />

        {isAuthenticated && user ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 p-1">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white uppercase shadow-xs">
                {user.name ? user.name.slice(0, 2) : 'AD'}
              </div>
              <div className="hidden text-left lg:block leading-tight">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-800">{user.name}</span>
                  <span className="rounded px-1.5 py-0.2 text-[10px] font-semibold bg-indigo-100 text-indigo-800 border border-indigo-300">
                    관리자
                  </span>
                </div>
                <div className="text-[11px] text-slate-400">{user.email}</div>
              </div>
            </div>

            <button
              onClick={logout}
              title="로그아웃"
              aria-label="로그아웃"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <Link
            href="/login"
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition shadow-sm"
          >
            <LogIn className="h-3.5 w-3.5" />
            <span>로그인</span>
          </Link>
        )}
      </div>
    </header>
  );
};
