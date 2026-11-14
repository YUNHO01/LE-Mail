'use client';

import React from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';

export default function OfflinePage() {
  const handleRetry = () => {
    window.location.reload();
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f5f5f7] px-6 text-center">
      <div className="w-full max-w-md rounded-2xl border border-black/[0.08] bg-white p-8 shadow-sm">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-[#0071e3]">
          <WifiOff className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-[#1d1d1f]">
          오프라인 상태입니다
        </h1>
        <p className="mt-2.5 text-sm leading-relaxed text-slate-500">
          네트워크 연결이 불안정하거나 끊어져 메일 콘솔에 연결할 수 없습니다. 연결 확인 후 다시 시도해 주세요.
        </p>
        <button
          type="button"
          onClick={handleRetry}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0071e3] px-4 py-2.5 text-sm font-medium text-white shadow-xs transition hover:bg-[#0062c4]"
        >
          <RefreshCw className="h-4 w-4" />
          <span>다시 시도</span>
        </button>
      </div>
    </div>
  );
}
