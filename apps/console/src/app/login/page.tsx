'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { formatBrandName } from '@lemail/shared-types';
import { Mail, Lock, ArrowRight, AlertCircle, Info, ShieldCheck } from 'lucide-react';

function ConsoleLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, licenseStatus, isAuthenticated, isAdmin, isLoading } = useAuth();
  const brandName = formatBrandName(licenseStatus);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [loginPhase, setLoginPhase] = useState<'idle' | 'authenticating' | 'redirecting'>('idle');
  const [redirectMessage, setRedirectMessage] = useState('관리자 콘솔로 이동 중입니다...');
  const isBusy = loginPhase !== 'idle';

  useEffect(() => {
    if (!isLoading && isAuthenticated && isAdmin) {
      if (licenseStatus && !licenseStatus.isValid) {
        router.replace('/license');
      } else {
        router.replace('/dashboard');
      }
    }
  }, [isLoading, isAuthenticated, isAdmin, licenseStatus, router]);

  useEffect(() => {
    const reason = searchParams.get('reason');
    if (reason === 'session_expired') {
      setInfoMessage('세션이 만료되었거나 인증이 해제되었습니다. 관리자 계정으로 다시 로그인해 주세요.');
    } else if (reason === 'admin_only') {
      setError('시스템 관리자 권한이 있는 계정만 접근할 수 있습니다. 관리자 계정으로 로그인해 주세요.');
    } else if (reason === 'error') {
      setInfoMessage('일시적인 시스템 오류로 인해 로그아웃되었습니다. 다시 로그인해 주세요.');
    }
  }, [searchParams]);

  // 안전 타이머: 라우트 전환이 비정상 지연될 경우 10초 후 로딩 상태 해제
  useEffect(() => {
    if (loginPhase !== 'redirecting') return;
    const timer = setTimeout(() => {
      setLoginPhase('idle');
      setError('화면 이동이 지연되고 있습니다. 다시 시도해 주세요.');
    }, 10000);
    return () => clearTimeout(timer);
  }, [loginPhase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isBusy) return;
    setError(null);
    setInfoMessage(null);
    setLoginPhase('authenticating');

    try {
      const res = await login(email, password);
      if (res.success) {
        let targetPath = '/dashboard';
        let nextMessage = '관리자 대시보드로 이동 중입니다...';

        if (res.licenseStatus && !res.licenseStatus.isValid) {
          targetPath = '/license';
          nextMessage = '라이선스 관리 화면으로 이동 중입니다...';
        }

        setRedirectMessage(nextMessage);
        setLoginPhase('redirecting');
        router.push(targetPath);
      } else {
        setError(res.message || '로그인에 실패했습니다.');
        setLoginPhase('idle');
      }
    } catch (err: any) {
      setError(err.message || '네트워크 연결 오류가 발생했습니다.');
      setLoginPhase('idle');
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-12 sm:px-6">
      {/* 배경 오피스 이미지 및 딤드 오버레이 (웹메일과 동일) */}
      <div className="absolute inset-0 -z-10">
        <Image
          src="/images/login-bg.jpg"
          alt="관리자 콘솔 로그인 배경"
          fill
          priority
          className="object-cover object-center"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]" />
      </div>

      {/* Top Brand Header */}
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-xl shadow-blue-500/30 ring-4 ring-white/20">
          <ShieldCheck className="h-8 w-8" />
        </div>
        <div className="mt-4 flex items-center gap-2">
          <h1 className="text-3xl font-extrabold tracking-tight text-white drop-shadow-md">
            {brandName}
          </h1>
          <span className="rounded-md bg-blue-500/30 border border-blue-300/50 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-blue-100">
            Admin
          </span>
        </div>
        <p className="mt-1.5 text-xs font-medium text-slate-200 drop-shadow-sm sm:text-sm">
          시스템 관리자 전용 운영 콘솔
        </p>
      </div>

      {/* Main Login Card */}
      <div className="w-full max-w-[420px] rounded-3xl border border-white/40 bg-white/95 p-8 shadow-2xl backdrop-blur-md sm:p-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <Lock className="h-5 w-5 text-blue-600" />
            <span>관리자 로그인</span>
          </div>
          <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700 border border-blue-200">
            SYSTEM_ADMIN
          </span>
        </div>
        <p className="mt-1.5 text-xs text-slate-500">
          시스템 관리자 권한이 부여된 계정으로만 로그인할 수 있습니다.
        </p>

        {infoMessage && (
          <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <Info className="h-4 w-4 flex-shrink-0 text-amber-600" />
            <span>{infoMessage}</span>
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
            <AlertCircle className="h-4 w-4 flex-shrink-0 text-rose-500" />
            <span>{error}</span>
          </div>
        )}

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="block text-xs font-semibold text-slate-700">
              관리자 이메일
            </label>
            <div className="relative mt-1.5">
              <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@lineedge.com"
                className="w-full rounded-xl border border-blue-100 bg-blue-50/60 py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              비밀번호
            </label>
            <div className="relative mt-1.5">
              <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full rounded-xl border border-blue-100 bg-blue-50/60 py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isBusy}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-sm font-semibold text-white shadow-md shadow-blue-600/30 transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:opacity-50"
          >
            {loginPhase === 'redirecting' ? (
              <span>이동 중...</span>
            ) : loginPhase === 'authenticating' ? (
              <span>권한 확인 중...</span>
            ) : (
              <>
                <span>관리자 로그인</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>
      </div>

      {/* 로그인 요청 및 화면 이동 완료까지 유지되는 전체 로딩 오버레이 */}
      {isBusy && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 backdrop-blur-sm"
        >
          <div className="flex w-full max-w-xs flex-col items-center gap-4 rounded-2xl border border-white/40 bg-white/95 px-6 py-7 text-center shadow-2xl">
            <div className="relative flex items-center justify-center">
              <div className="h-11 w-11 rounded-full border-[3px] border-blue-100" />
              <div className="absolute inset-0 h-11 w-11 animate-spin rounded-full border-[3px] border-blue-600 border-t-transparent" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-800">
                {loginPhase === 'redirecting' ? redirectMessage : '관리자 권한을 확인 중입니다...'}
              </p>
              <p className="text-xs text-slate-500">잠시만 기다려 주세요.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ConsoleLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300 text-sm">
          관리자 로그인 페이지 로딩 중...
        </div>
      }
    >
      <ConsoleLoginForm />
    </Suspense>
  );
}
