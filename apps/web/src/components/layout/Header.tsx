'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { Menu, ExternalLink, LogOut, LogIn, Shield, Download } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigation } from '../../contexts/NavigationContext';
import { usePwa } from '../../contexts/PwaContext';
import Link from 'next/link';

interface HeaderProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

export const Header: React.FC<HeaderProps> = ({ sidebarOpen, setSidebarOpen }) => {
  const pathname = usePathname();
  const { user, isAuthenticated, isAdmin, logout } = useAuth();
  const { startNavigation } = useNavigation();
  const { canInstall, isStandalone, promptInstall } = usePwa();

  const isAdminRoute = pathname?.startsWith('/admin');

  const handleLogout = () => {
    logout();
  };

  return (
    <header
      className={
        isAdminRoute
          ? 'sticky top-0 z-20 flex h-16 w-full shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 shadow-sm'
          : 'sticky top-0 z-20 flex h-12 w-full shrink-0 items-center justify-between border-b border-black/[0.08] bg-[#f5f5f7]/90 backdrop-blur-xl px-4'
      }
    >
      <div className="flex items-center gap-3">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className={`rounded-lg p-1.5 lg:hidden ${
            isAdminRoute
              ? 'text-slate-600 hover:bg-slate-100'
              : 'text-[#1d1d1f] hover:bg-black/[0.05]'
          }`}
          aria-label="Toggle Sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>

      </div>

      <div className="flex items-center gap-2.5">
        {/* PWA 설치 가능 시 앱 설치 버튼 표시 */}
        {canInstall && !isStandalone && (
          <button
            type="button"
            onClick={promptInstall}
            className="flex items-center gap-1.5 rounded-full bg-[#0071e3]/10 border border-[#0071e3]/20 px-3 py-1 text-[11px] font-medium text-[#0071e3] hover:bg-[#0071e3]/15 transition"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">앱 설치</span>
          </button>
        )}

        {/* 웹메일 화면에서 관리자 계정일 때 관리자 콘솔 전환 버튼 제공 */}
        {!isAdminRoute && isAuthenticated && isAdmin && (
          <Link
            href="/admin/dashboard"
            onClick={() => startNavigation('/admin/dashboard')}
            onMouseDown={() => startNavigation('/admin/dashboard')}
            className="hidden sm:flex items-center gap-1.5 rounded-full bg-white border border-black/[0.08] px-3 py-1 text-[11px] font-medium text-[#1d1d1f] hover:bg-black/[0.03] transition"
          >
            <Shield className="h-3.5 w-3.5 text-[#0071e3]" />
            <span>관리자 콘솔</span>
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
                className={`flex items-center justify-center rounded-full text-xs font-bold text-white uppercase shadow-xs ${
                  isAdminRoute ? 'h-8 w-8' : 'h-7 w-7 text-[11px]'
                } ${
                  user.role === 'SYSTEM_ADMIN'
                    ? isAdminRoute
                      ? 'bg-indigo-600'
                      : 'bg-[#0071e3]'
                    : 'bg-[#0071e3]'
                }`}
              >
                {user.name ? user.name.slice(0, 2) : 'US'}
              </div>
              <div className="hidden text-left lg:block leading-tight">
                <div className="flex items-center gap-1.5">
                  <span className={`text-xs font-semibold ${isAdminRoute ? 'text-slate-800' : 'text-[#1d1d1f]'}`}>
                    {user.name}
                  </span>
                  {isAdminRoute && (
                    <span
                      className={`rounded px-1.5 py-0.2 text-[10px] font-semibold ${
                        user.role === 'SYSTEM_ADMIN'
                          ? 'bg-indigo-100 text-indigo-800 border border-indigo-300'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {user.role === 'SYSTEM_ADMIN' ? '관리자' : '일반사용자'}
                    </span>
                  )}
                </div>
                <div className={`text-[11px] ${isAdminRoute ? 'text-slate-400' : 'text-[#86868b]'}`}>
                  {user.email}
                </div>
              </div>
            </div>

            {/* 로그아웃 버튼 */}
            <button
              onClick={handleLogout}
              title="로그아웃"
              aria-label="로그아웃"
              className={`rounded-lg p-1.5 transition ${
                isAdminRoute
                  ? 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
                  : 'text-[#86868b] hover:bg-black/[0.05] hover:text-[#1d1d1f]'
              }`}
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
