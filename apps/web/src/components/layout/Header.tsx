'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Menu, ExternalLink, LogOut, LogIn, Shield, Mail, Settings, ChevronDown, User as UserIcon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigation } from '../../contexts/NavigationContext';
import Link from 'next/link';

interface HeaderProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

export const Header: React.FC<HeaderProps> = ({ sidebarOpen, setSidebarOpen }) => {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, isAdmin, logout } = useAuth();
  const { startNavigation } = useNavigation();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const isAdminRoute = pathname?.startsWith('/admin');

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    if (userMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [userMenuOpen]);

  const handleLogout = () => {
    setUserMenuOpen(false);
    logout();
    router.push('/login');
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
              href="http://localhost:9200/api/docs"
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
          <div className="relative" ref={userMenuRef}>
            {/* 사용자 프로필 토글 버튼 */}
            <button
              onClick={() => setUserMenuOpen((prev) => !prev)}
              className="flex items-center gap-2 p-1 rounded-xl hover:bg-slate-100/80 transition focus:outline-none"
              aria-expanded={userMenuOpen}
              aria-haspopup="true"
            >
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
              <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* 사용자 메뉴 드롭다운 팝오버 */}
            {userMenuOpen && (
              <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-white shadow-xl border border-slate-200/80 py-2 z-50 text-xs animate-in fade-in slide-in-from-top-2 duration-150">
                {/* 헤더 사용자 정보 */}
                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60 rounded-t-2xl">
                  <div className="font-semibold text-slate-900 text-sm flex items-center gap-1.5">
                    <span>{user.name}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        user.role === 'SYSTEM_ADMIN'
                          ? 'bg-indigo-100 text-indigo-800'
                          : 'bg-slate-200/70 text-slate-700'
                      }`}
                    >
                      {user.role === 'SYSTEM_ADMIN' ? '관리자' : '일반'}
                    </span>
                  </div>
                  <div className="text-slate-500 text-[11px] truncate mt-0.5">{user.email}</div>
                </div>

                {/* 메뉴 목록 */}
                <div className="py-1">
                  <Link
                    href="/mail/settings"
                    onClick={() => {
                      setUserMenuOpen(false);
                      startNavigation('/mail/settings');
                    }}
                    onMouseDown={() => startNavigation('/mail/settings')}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-slate-700 hover:bg-slate-100/80 transition font-medium"
                  >
                    <Settings className="h-4 w-4 text-slate-500" />
                    <div className="flex-1">
                      <div className="font-semibold">환경설정</div>
                      <div className="text-[10px] text-slate-400">서명, 메일함 백업, 스팸 차단 관리</div>
                    </div>
                  </Link>

                  {isAdmin && (
                    <Link
                      href="/admin/dashboard"
                      onClick={() => {
                        setUserMenuOpen(false);
                        startNavigation('/admin/dashboard');
                      }}
                      onMouseDown={() => startNavigation('/admin/dashboard')}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-indigo-700 hover:bg-indigo-50/80 transition font-medium"
                    >
                      <Shield className="h-4 w-4 text-indigo-500" />
                      <span>관리자 콘솔</span>
                    </Link>
                  )}
                </div>

                {/* 하단 구분선 및 로그아웃 */}
                <div className="pt-1 border-t border-slate-100 mt-1">
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2.5 w-full px-4 py-2 text-rose-600 hover:bg-rose-50/80 transition font-medium text-left"
                  >
                    <LogOut className="h-4 w-4 text-rose-500" />
                    <span>로그아웃</span>
                  </button>
                </div>
              </div>
            )}
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
