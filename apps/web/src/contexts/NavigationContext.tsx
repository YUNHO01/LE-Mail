'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

interface NavigationContextType {
  isNavigating: boolean;
  startNavigation: (targetHref?: string) => void;
  endNavigation: () => void;
}

const NavigationContext = createContext<NavigationContextType>({
  isNavigating: false,
  startNavigation: () => {},
  endNavigation: () => {},
});

function NavigationWatcher({ onNavigateDone }: { onNavigateDone: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    onNavigateDone();
  }, [pathname, searchParams, onNavigateDone]);

  return null;
}

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const [isNavigating, setIsNavigating] = useState(false);

  const endNavigation = useCallback(() => {
    setIsNavigating(false);
  }, []);

  const startNavigation = useCallback((targetHref?: string) => {
    if (targetHref && typeof window !== 'undefined') {
      try {
        const url = new URL(targetHref, window.location.origin);
        if (url.pathname === window.location.pathname && url.search === window.location.search) {
          return;
        }
      } catch {}
    }
    // 동기 상태 업데이트로 0ms 즉각 반응 표출
    setIsNavigating(true);
  }, []);

  // 안전 타이머: 라우트 전환이 중단되거나 비정상 지연될 경우 8초 후 자동 해제
  useEffect(() => {
    if (!isNavigating) return;
    const timer = setTimeout(() => {
      setIsNavigating(false);
    }, 8000);
    return () => clearTimeout(timer);
  }, [isNavigating]);

  // 내부 <a> 링크 클릭 시에도 즉시 로딩 시작하여 전체 애플리케이션에 반응형 로딩 적용
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = (e.target as HTMLElement)?.closest('a');
      if (!target) return;
      const href = target.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('javascript:')) return;
      if (target.getAttribute('target') === '_blank') return;
      if (target.getAttribute('download')) return;

      try {
        const url = new URL(target.href, window.location.origin);
        if (url.origin === window.location.origin) {
          if (url.pathname !== window.location.pathname || url.search !== window.location.search) {
            startNavigation(target.href);
          }
        }
      } catch {}
    };

    window.addEventListener('click', handleClick, { capture: true });
    return () => window.removeEventListener('click', handleClick, { capture: true });
  }, [startNavigation]);

  return (
    <NavigationContext.Provider value={{ isNavigating, startNavigation, endNavigation }}>
      <Suspense fallback={null}>
        <NavigationWatcher onNavigateDone={endNavigation} />
      </Suspense>
      {children}
    </NavigationContext.Provider>
  );
}

export const useNavigation = () => useContext(NavigationContext);
