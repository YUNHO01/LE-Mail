'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, LogIn, RotateCcw } from 'lucide-react';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error('애플리케이션 오류 발생:', error);

    const errorMessage = error?.message?.toLowerCase() || '';
    const isAuthError =
      errorMessage.includes('401') ||
      errorMessage.includes('unauthorized') ||
      errorMessage.includes('jwt') ||
      errorMessage.includes('token') ||
      errorMessage.includes('session');

    // 세션 만료 또는 인증 관련 오류 시 토큰 정리 후 로그인 페이지로 즉각 이동
    if (isAuthError) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('lemail_token');
        localStorage.removeItem('lemail_user');
      }
      router.replace('/login?reason=session_expired');
    }
  }, [error, router]);

  const handleGoToLogin = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('lemail_token');
      localStorage.removeItem('lemail_user');
    }
    router.replace('/login');
  };

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 text-rose-500 border border-rose-100 shadow-sm mb-4">
        <AlertCircle className="h-8 w-8" />
      </div>
      <h2 className="text-xl font-bold text-slate-800 mb-2">
        서비스 오류가 발생했습니다
      </h2>
      <p className="text-sm text-slate-500 max-w-md mb-6 leading-relaxed">
        {error.message || '세션이 만료되었거나 처리 중 일시적인 오류가 발생했습니다. 다시 로그인하여 이용해 주세요.'}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 hover:text-slate-900 transition"
        >
          <RotateCcw className="h-4 w-4" />
          <span>다시 시도</span>
        </button>

        <button
          type="button"
          onClick={handleGoToLogin}
          className="flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 transition"
        >
          <LogIn className="h-4 w-4" />
          <span>로그인 페이지로 이동</span>
        </button>
      </div>
    </div>
  );
}
