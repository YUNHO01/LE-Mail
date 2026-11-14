'use client';

import React from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';

export default function OfflinePage() {
  const handleRetry = () => {
    window.location.reload();
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#F2F2F7] px-6 text-center">
      <div className="w-full max-w-sm rounded-3xl border border-slate-200/80 bg-white p-8 shadow-sm">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-50 text-[#007AFF]">
          <WifiOff className="h-8 w-8" />
        </div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">
          네트워크에 연결되어 있지 않습니다
        </h1>
        <p className="mt-2.5 text-sm leading-relaxed text-slate-500">
          인터넷 연결이 끊어져 화면을 불러올 수 없습니다. 연결 상태를 확인한 후 다시 시도해 주세요.
        </p>
        <button
          type="button"
          onClick={handleRetry}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#007AFF] px-4 py-3 text-sm font-semibold text-white shadow-xs transition active:scale-[0.99] hover:bg-[#0066D6]"
        >
          <RefreshCw className="h-4 w-4" />
          <span>다시 시도</span>
        </button>
      </div>
    </div>
  );
}
