'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { Menu, ExternalLink, LogOut, LogIn, Shield } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigation } from '../../contexts/NavigationContext';
import Link from 'next/link';

interface HeaderProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

export const Header: React.FC<HeaderProps> = ({ sidebarOpen, setSidebarOpen }) => {
  const pathname = usePathname();
  const { user, isAuthenticated, isAdmin, logout } = useAuth();
  const { startNavigation } = useNavigation();

  const isAdminRoute = pathname?.startsWith('/admin');

  const handleLogout = () => {
    logout();
  };

  return (
    <header className="sticky top-0 z-20 flex h-16 w-full shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 shadow-sm">
      <div className="flex items-center gap-4">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden"
          aria-label="Toggle Sidebar"
        >
          <Menu className="h-6 w-6" />
        </button>
      </div>

      <div className="flex items-center gap-3">
        {/* 웹메일 화면에서 관리자 계정일 때 관리자 콘솔 전환 버튼 제공 */}
        {!isAdminRoute && isAuthenticated && isAdmin && (
          <Link
            href="/admin/dashboard"
            onClick={() => startNavigation('/admin/dashboard')}
            onMouseDown={() => startNavigation('/admin/dashboard')}
            className="hidden sm:flex items-center gap-1.5 rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition shadow-sm"
          >
            <Shield className="h-3.5 w-3.5" />
            <span>관리자 콘솔로 전환</span>
          </Link>
        )}

        {/* Swagger Docs는 관리자 콘솔에서만 표시 (사용자 웹메일에서는 숨김) */}
        {isAdminRoute && (
          <>
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
          </>
        )}

        {isAuthenticated && user ? (
          <div className="flex items-center gap-3">
            {/* 사용자 정보 */}
            <div className="flex items-center gap-2 p-1">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white uppercase shadow-sm ${
                  user.role === 'SYSTEM_ADMIN' ? 'bg-indigo-600' : 'bg-sky-600'
                }`}
              >
                {user.name ? user.name.slice(0, 2) : 'US'}
              </div>
              <div className="hidden text-left lg:block">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-800">{user.name}</span>
                  <span
                    className={`rounded px-1.5 py-0.2 text-[10px] font-semibold ${
                      user.role === 'SYSTEM_ADMIN'
                        ? 'bg-indigo-100 text-indigo-800 border border-indigo-300'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {user.role === 'SYSTEM_ADMIN' ? '관리자' : '일반사용자'}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400">{user.email}</div>
              </div>
            </div>

            {/* 로그아웃 버튼 */}
            <button
              onClick={handleLogout}
              title="로그아웃"
              aria-label="로그아웃"
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <Link
            href="/login"
            className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 transition shadow-sm"
          >
            <LogIn className="h-3.5 w-3.5" />
            <span>로그인</span>
          </Link>
        )}
      </div>
    </header>
  );
};
