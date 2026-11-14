'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { RefreshCw } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface PwaContextType {
  isStandalone: boolean;
  canInstall: boolean;
  updateAvailable: boolean;
  promptInstall: () => Promise<void>;
  applyUpdate: () => void;
}

const PwaContext = createContext<PwaContextType>({
  isStandalone: false,
  canInstall: false,
  updateAvailable: false,
  promptInstall: async () => {},
  applyUpdate: () => {},
});

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [isStandalone, setIsStandalone] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const waitingWorkerRef = useRef<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    const enableSw =
      process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_ENABLE_PWA === 'true';

    let reloading = false;
    const handleControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };

    if ('serviceWorker' in navigator && enableSw) {
      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((registration) => {
          if (registration.waiting) {
            waitingWorkerRef.current = registration.waiting;
            setUpdateAvailable(true);
          }

          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (!newWorker) return;
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                waitingWorkerRef.current = newWorker;
                setUpdateAvailable(true);
              }
            });
          });
        })
        .catch(() => {
          // HTTPS 미적용 등 환경에서 등록 실패 시 조용히 무시
        });
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      }
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  }, [deferredPrompt]);

  const applyUpdate = useCallback(() => {
    if (waitingWorkerRef.current) {
      waitingWorkerRef.current.postMessage({ type: 'SKIP_WAITING' });
    } else {
      window.location.reload();
    }
  }, []);

  return (
    <PwaContext.Provider
      value={{
        isStandalone,
        canInstall: !!deferredPrompt,
        updateAvailable,
        promptInstall,
        applyUpdate,
      }}
    >
      {children}

      {/* 새 버전 업데이트 알림 */}
      {updateAvailable && (
        <div className="fixed bottom-4 right-4 z-50 w-full max-w-sm rounded-xl border border-sky-200 bg-white/95 p-3.5 shadow-lg backdrop-blur-md">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-[#0071e3]">
                <RefreshCw className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#1d1d1f]">새 버전이 준비되었습니다</p>
                <p className="truncate text-[11px] text-slate-500">새로고침하여 최신 버전을 적용하세요.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={applyUpdate}
              className="shrink-0 rounded-lg bg-[#0071e3] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#0062c4] transition"
            >
              업데이트
            </button>
          </div>
        </div>
      )}
    </PwaContext.Provider>
  );
}

export function usePwa() {
  return useContext(PwaContext);
}
