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
    if (!isLoading && !isAuthenticated && pathname !== '/login') {
      router.replace('/login');
    }
  }, [isLoading, isAuthenticated, pathname, router]);

  if (pathname === '/login') {
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
        <div className="fixed top-0 left-0 right-0 z-50 h-0.5 bg-[#007AFF]/20 overflow-hidden">
          <div className="h-full w-full animate-pulse bg-[#007AFF]" />
        </div>
      )}

      <main className={`relative flex-1 overflow-x-hidden ${hideBottomNav ? '' : 'pb-16'}`}>
        {children}
      </main>

      <MobileBottomNav />
    </div>
  );
};
