'use client';

import React, { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { MobileHeader } from './MobileHeader';
import { MobileDrawer } from './MobileDrawer';
import { MobileBottomNav } from './MobileBottomNav';
import { useNavigation } from '../../contexts/NavigationContext';
import { useAuth } from '../../contexts/AuthContext';

export const MobileLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { isNavigating } = useNavigation();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated && pathname !== '/login' && pathname !== '/offline') {
      router.replace('/login');
    }
  }, [isLoading, isAuthenticated, pathname, router]);

  if (pathname === '/login' || pathname === '/offline') {
    return <>{children}</>;
  }

  if (isLoading || !isAuthenticated) {
    return null;
  }

  const isMailDetail =
    /^\/mail\/(?!inbox|sent|drafts|spam|trash|compose|contacts|calendar|settings|folder|view)[^/]+$/.test(
      pathname || '',
    );
  const hideBottomNav = pathname?.startsWith('/mail/compose') || isMailDetail;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#F2F2F7]">
      <MobileHeader onOpenDrawer={() => setDrawerOpen(true)} />
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {isNavigating && (
        <>
          <div className="fixed top-0 left-0 right-0 z-50 h-0.5 bg-[#007AFF]/20 overflow-hidden">
            <div className="h-full w-full animate-pulse bg-[#007AFF]" />
          </div>
          <div
            role="status"
            aria-live="polite"
            className="fixed inset-0 z-40 flex items-center justify-center bg-[#F2F2F7]/85 backdrop-blur-xs px-4 transition-opacity duration-150"
          >
            <div className="flex w-full max-w-xs flex-col items-center gap-3.5 rounded-2xl border border-slate-200/80 bg-white/95 px-6 py-6 shadow-lg">
              <div className="relative flex items-center justify-center">
                <div className="h-10 w-10 rounded-full border-[3px] border-sky-100" />
                <div className="absolute inset-0 h-10 w-10 rounded-full border-[3px] border-[#007AFF] border-t-transparent animate-spin" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-semibold text-slate-800">
                  화면을 불러오는 중입니다...
                </p>
                <p className="text-xs text-slate-400">
                  잠시만 기다려 주세요.
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      <main className={`relative flex-1 overflow-x-hidden ${hideBottomNav ? '' : 'pb-16'}`}>
        {children}
      </main>

      <MobileBottomNav />
    </div>
  );
};
