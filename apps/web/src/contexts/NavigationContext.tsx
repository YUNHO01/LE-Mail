'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

interface NavigationContextType {
  isNavigating: boolean;
  startNavigation: (targetHref?: string) => void;
  endNavigation: () => void;
  registerUnsavedGuard: (isDirty: boolean, message?: string) => void;
  navigateWithGuard: (href: string) => void;
}

const NavigationContext = createContext<NavigationContextType>({
  isNavigating: false,
  startNavigation: () => {},
  endNavigation: () => {},
  registerUnsavedGuard: () => {},
  navigateWithGuard: () => {},
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
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const delayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unsavedGuardRef = useRef<{ isDirty: boolean; message: string }>({
    isDirty: false,
    message: '작성 중인 내용이 저장되지 않았습니다. 이동할까요?',
  });

  const registerUnsavedGuard = useCallback((isDirty: boolean, message?: string) => {
    unsavedGuardRef.current = {
      isDirty,
      message: message || '작성 중인 내용이 저장되지 않았습니다. 이동할까요?',
    };
  }, []);

  const endNavigation = useCallback(() => {
    if (delayTimerRef.current) {
      clearTimeout(delayTimerRef.current);
      delayTimerRef.current = null;
    }
    setIsNavigating(false);
  }, []);

  const startNavigation = useCallback((targetHref?: string) => {
    if (unsavedGuardRef.current.isDirty) {
      return;
    }
    if (targetHref && typeof window !== 'undefined') {
      try {
        const url = new URL(targetHref, window.location.origin);
        if (url.pathname === window.location.pathname && url.search === window.location.search) {
          return;
        }
      } catch {}
    }
    // 프리패치된 빠른 전환에서는 전체 로딩 화면이 번쩍이지 않도록 180ms 지연 후 표시
    if (delayTimerRef.current) {
      clearTimeout(delayTimerRef.current);
    }
    delayTimerRef.current = setTimeout(() => {
      setIsNavigating(true);
      delayTimerRef.current = null;
    }, 180);
  }, []);

  const navigateWithGuard = useCallback(
    (href: string) => {
      if (unsavedGuardRef.current.isDirty) {
        setPendingHref(href);
        return;
      }
      startNavigation(href);
      router.push(href);
    },
    [router, startNavigation],
  );

  // 안전 타이머: 라우트 전환이 중단되거나 비정상 지연될 경우 8초 후 자동 해제
  useEffect(() => {
    if (!isNavigating) return;
    const timer = setTimeout(() => {
      setIsNavigating(false);
    }, 8000);
    return () => clearTimeout(timer);
  }, [isNavigating]);

  // 내부 <a> 링크 클릭 시에도 즉시 로딩 시작 + 미저장 가드 확인
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
            if (unsavedGuardRef.current.isDirty) {
              e.preventDefault();
              e.stopPropagation();
              setPendingHref(url.pathname + url.search + url.hash);
              return;
            }
            startNavigation(target.href);
          }
        }
      } catch {}
    };

    window.addEventListener('click', handleClick, { capture: true });
    return () => window.removeEventListener('click', handleClick, { capture: true });
  }, [startNavigation]);

  useEffect(() => {
    if (!pendingHref) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPendingHref(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [pendingHref]);

  const handleConfirmLeave = () => {
    if (!pendingHref) return;
    const target = pendingHref;
    setPendingHref(null);
    unsavedGuardRef.current.isDirty = false;
    startNavigation(target);
    router.push(target);
  };

  return (
    <NavigationContext.Provider
      value={{ isNavigating, startNavigation, endNavigation, registerUnsavedGuard, navigateWithGuard }}
    >
      <Suspense fallback={null}>
        <NavigationWatcher onNavigateDone={endNavigation} />
      </Suspense>
      {children}

      {pendingHref && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="이동 확인"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPendingHref(null);
          }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-xs p-4"
        >
          <div className="w-full max-w-sm rounded-2xl border border-black/[0.08] bg-white p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-[#1d1d1f]">페이지를 이동할까요?</h3>
            <p className="text-xs text-[#6e6e73] leading-relaxed">
              {unsavedGuardRef.current.message}
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setPendingHref(null)}
                className="h-9 rounded-lg border border-black/[0.1] px-4 text-xs font-semibold text-[#6e6e73] hover:bg-black/[0.03] transition"
              >
                머무르기
              </button>
              <button
                type="button"
                onClick={handleConfirmLeave}
                className="h-9 rounded-lg bg-[#0071e3] px-4 text-xs font-semibold text-white hover:bg-[#0062c4] transition"
              >
                저장하지 않고 이동
              </button>
            </div>
          </div>
        </div>
      )}
    </NavigationContext.Provider>
  );
}

export const useNavigation = () => useContext(NavigationContext);
