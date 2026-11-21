'use client';

import React, { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ConsoleSidebar } from './ConsoleSidebar';
import { ConsoleHeader } from './ConsoleHeader';
import { useNavigation } from '../../contexts/NavigationContext';
import { useAuth } from '../../contexts/AuthContext';

export const ConsoleLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { isNavigating } = useNavigation();
  const { isAuthenticated, isAdmin, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && (!isAuthenticated || !isAdmin) && pathname !== '/login') {
      router.replace('/login');
    }
  }, [isLoading, isAuthenticated, isAdmin, pathname, router]);

  if (pathname === '/login') {
    return <>{children}</>;
  }

  if (isLoading || !isAuthenticated || !isAdmin) {
    return null;
  }

  return (
    <div className="flex h-screen overflow-hidden relative bg-[#f5f5f7] text-[#1d1d1f]">
      <ConsoleSidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

      <div className="relative flex flex-1 flex-col h-full overflow-hidden min-w-0">
        <ConsoleHeader sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

        {isNavigating && (
          <div className="absolute top-12 left-0 right-0 h-0.5 bg-black/5 z-50 overflow-hidden">
            <div className="h-full animate-pulse w-full origin-left transition-all bg-[#0071e3]" />
          </div>
        )}

        <main className="flex-1 relative min-h-0 overflow-y-auto overflow-x-hidden">
          {isNavigating && (
            <div className="absolute inset-0 bg-[#f5f5f7]/90 backdrop-blur-xs z-40 transition-all duration-150">
              <div className="px-4 sm:px-6 lg:px-8 py-8 w-full">
                <div className="w-full space-y-6 animate-pulse">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-black/[0.06]">
                    <div className="space-y-2">
                      <div className="h-7 w-48 bg-slate-200 rounded-md" />
                      <div className="h-4 w-72 bg-slate-200/60 rounded" />
                    </div>
                    <div className="h-9 w-28 bg-slate-200 rounded-lg self-start sm:self-auto" />
                  </div>

                  <div className="bg-white rounded-xl border border-black/[0.08] shadow-sm p-6 sm:p-8 min-h-[420px] flex flex-col items-center justify-center relative overflow-hidden">
                    <div className="w-full space-y-4 mb-8 max-w-2xl opacity-40">
                      <div className="h-4 bg-slate-200 rounded w-full" />
                      <div className="h-4 bg-slate-200 rounded w-5/6" />
                      <div className="h-4 bg-slate-200 rounded w-4/6" />
                    </div>

                    <div className="flex flex-col items-center gap-3.5 z-10">
                      <div className="relative flex items-center justify-center">
                        <div className="w-10 h-10 rounded-full border-[3px] border-sky-100" />
                        <div className="absolute inset-0 w-10 h-10 rounded-full border-[3px] border-t-transparent animate-spin border-[#0071e3]" />
                      </div>
                      <div className="text-center space-y-1">
                        <p className="text-sm font-semibold text-[#1d1d1f]">
                          화면을 불러오는 중입니다...
                        </p>
                        <p className="text-xs text-[#86868b]">
                          데이터를 준비하고 있습니다. 잠시만 기다려 주세요.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="px-4 sm:px-6 lg:px-8 py-6 w-full">
            <div className="w-full space-y-6">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
};
