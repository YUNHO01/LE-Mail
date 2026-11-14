'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { Download, RefreshCw, Share, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface PwaContextType {
  isStandalone: boolean;
  canInstall: boolean;
  isIosPromptVisible: boolean;
  updateAvailable: boolean;
  promptInstall: () => Promise<void>;
  applyUpdate: () => void;
  dismissIosPrompt: () => void;
}

const PwaContext = createContext<PwaContextType>({
  isStandalone: false,
  canInstall: false,
  isIosPromptVisible: false,
  updateAvailable: false,
  promptInstall: async () => {},
  applyUpdate: () => {},
  dismissIosPrompt: () => {},
});

const IOS_PROMPT_DISMISSED_KEY = 'lemail_mobile_ios_a2hs_dismissed';
const ANDROID_BANNER_DISMISSED_KEY = 'lemail_mobile_a2hs_dismissed';

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [isStandalone, setIsStandalone] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showAndroidBanner, setShowAndroidBanner] = useState(false);
  const [isIosPromptVisible, setIsIosPromptVisible] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const waitingWorkerRef = useRef<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);

    if (!standalone) {
      const ua = window.navigator.userAgent;
      const isIos = /iPad|iPhone|iPod/.test(ua) && !(window as Window & { MSStream?: unknown }).MSStream;
      const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
      const dismissed = localStorage.getItem(IOS_PROMPT_DISMISSED_KEY) === '1';
      if (isIos && isSafari && !dismissed) {
        setIsIosPromptVisible(true);
      }
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      if (localStorage.getItem(ANDROID_BANNER_DISMISSED_KEY) !== '1') {
        setShowAndroidBanner(true);
      }
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setShowAndroidBanner(false);
      setIsStandalone(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // Service Worker 등록 (프로덕션 또는 명시적 활성화 시)
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
      setShowAndroidBanner(false);
    }
  }, [deferredPrompt]);

  const dismissAndroidBanner = useCallback(() => {
    setShowAndroidBanner(false);
    localStorage.setItem(ANDROID_BANNER_DISMISSED_KEY, '1');
  }, []);

  const dismissIosPrompt = useCallback(() => {
    setIsIosPromptVisible(false);
    localStorage.setItem(IOS_PROMPT_DISMISSED_KEY, '1');
  }, []);

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
        isIosPromptVisible,
        updateAvailable,
        promptInstall,
        applyUpdate,
        dismissIosPrompt,
      }}
    >
      {children}

      {/* 새 버전 업데이트 알림 */}
      {updateAvailable && (
        <div className="fixed top-3 left-3 right-3 z-50 mx-auto max-w-md rounded-2xl border border-sky-200 bg-white/95 p-3.5 shadow-lg backdrop-blur-md">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-[#007AFF]">
                <RefreshCw className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-900">새 버전이 준비되었습니다</p>
                <p className="truncate text-[11px] text-slate-500">최신 기능과 보안 패치를 적용하세요.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={applyUpdate}
              className="shrink-0 rounded-xl bg-[#007AFF] px-3 py-1.5 text-xs font-semibold text-white active:scale-95"
            >
              업데이트
            </button>
          </div>
        </div>
      )}

      {/* Android/Chromium 설치 배너 */}
      {!isStandalone && showAndroidBanner && deferredPrompt && !updateAvailable && (
        <div className="fixed bottom-[calc(4.25rem+env(safe-area-inset-bottom))] left-3 right-3 z-40 mx-auto max-w-md rounded-2xl border border-slate-200/90 bg-white/95 p-3.5 shadow-lg backdrop-blur-md">
          <div className="flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#007AFF] text-white">
                <Download className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900">LEMail 앱 설치</p>
                <p className="truncate text-[11px] text-slate-500">홈 화면에서 앱처럼 빠르게 실행하세요.</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={promptInstall}
                className="rounded-xl bg-[#007AFF] px-3 py-1.5 text-xs font-semibold text-white active:scale-95"
              >
                설치
              </button>
              <button
                type="button"
                onClick={dismissAndroidBanner}
                aria-label="설치 안내 닫기"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* iOS Safari 홈 화면 추가 안내 배너 */}
      {!isStandalone && isIosPromptVisible && !updateAvailable && (
        <div className="fixed bottom-[calc(4.25rem+env(safe-area-inset-bottom))] left-3 right-3 z-40 mx-auto max-w-md rounded-2xl border border-slate-200/90 bg-white/95 p-3.5 shadow-lg backdrop-blur-md">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-[#007AFF]">
                <Share className="h-4 w-4" />
              </div>
              <div className="text-xs text-slate-700 leading-relaxed">
                <p className="font-bold text-slate-900">홈 화면에 LEMail 추가</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  하단 <span className="font-semibold text-slate-700">공유</span> 버튼을 누른 뒤{' '}
                  <span className="font-semibold text-slate-700">홈 화면에 추가</span>를 선택하세요.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={dismissIosPrompt}
              aria-label="안내 닫기"
              className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100"
            >
              <X className="h-4 w-4" />
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
