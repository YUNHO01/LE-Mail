'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { Mail, Lock, ArrowRight, AlertCircle, Info, Fingerprint } from 'lucide-react';
import { BIOMETRIC_HINT_EMAIL_KEY, isBiometricSupported } from '../../lib/webauthn';

function MobileLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, loginWithBiometric, isAuthenticated, isLoading } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [isBiometricSubmitting, setIsBiometricSubmitting] = useState(false);

  useEffect(() => {
    isBiometricSupported().then((ok) => {
      setBiometricAvailable(ok);
    });
    if (typeof window !== 'undefined') {
      const hintEmail = localStorage.getItem(BIOMETRIC_HINT_EMAIL_KEY);
      if (hintEmail) {
        setEmail((prev) => prev || hintEmail);
      }
    }
  }, []);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace('/mail/inbox');
    }
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    const reason = searchParams.get('reason');
    if (reason === 'session_expired') {
      setInfoMessage('세션이 만료되었거나 인증이 해제되었습니다. 다시 로그인해 주세요.');
    } else if (reason === 'license_required') {
      setError('유효한 시스템 라이선스가 등록되어 있지 않거나 만료되었습니다. 내부 관리자 콘솔에서 라이선스를 확인해 주세요.');
    } else if (reason === 'error') {
      setInfoMessage('일시적인 시스템 오류로 인해 로그아웃되었습니다. 다시 로그인해 주세요.');
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const res = await login(email, password);
      if (res.success) {
        // 관리자(SYSTEM_ADMIN) 포함 모든 사용자는 사용자 웹메일로 이동
        router.push('/mail/inbox');
      } else {
        setError(res.message || '로그인에 실패했습니다.');
      }
    } catch (err: any) {
      setError(err.message || '네트워크 연결 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBiometricLogin = async () => {
    setError(null);
    setIsBiometricSubmitting(true);
    try {
      const res = await loginWithBiometric(email);
      if (res.success) {
        router.push('/mail/inbox');
      } else {
        setError(res.message || '생체인식 로그인에 실패했습니다.');
      }
    } catch (err: any) {
      setError(err.message || '생체인식 로그인 중 오류가 발생했습니다.');
    } finally {
      setIsBiometricSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-4 py-8">
      <div className="absolute inset-0 -z-10">
        <Image
          src="/images/login-bg.jpg"
          alt="모바일 웹메일 로그인 배경"
          fill
          priority
          className="object-cover object-center"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-slate-900/55 backdrop-blur-[2px]" />
      </div>

      <div className="mb-6 flex flex-col items-center text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-600 text-white shadow-xl shadow-sky-500/30 ring-4 ring-white/20">
          <Mail className="h-7 w-7" />
        </div>
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-white drop-shadow-md">
          LEMail 모바일
        </h1>
        <p className="mt-1 text-xs font-medium text-slate-200 drop-shadow-sm">
          언제 어디서나 안전하게 접속하는 기업용 웹메일
        </p>
      </div>

      <div className="w-full max-w-sm rounded-3xl border border-white/40 bg-white/95 p-6 shadow-2xl backdrop-blur-md">
        <div className="flex items-center gap-2 text-lg font-bold text-slate-900">
          <Lock className="h-5 w-5 text-sky-600" />
          <span>로그인</span>
        </div>

        {infoMessage && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
            <span>{infoMessage}</span>
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label htmlFor="email" className="block text-xs font-semibold text-slate-700">
              이메일 주소
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              className="mt-1.5 block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-xs font-semibold text-slate-700">
              비밀번호
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호를 입력하세요"
              className="mt-1.5 block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting || isBiometricSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-sky-600/25 transition hover:bg-sky-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span>{isSubmitting ? '로그인 중...' : '로그인'}</span>
            {!isSubmitting && <ArrowRight className="h-4 w-4" />}
          </button>

          {biometricAvailable && (
            <button
              type="button"
              onClick={handleBiometricLogin}
              disabled={isSubmitting || isBiometricSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Fingerprint className="h-4 w-4 text-[#007AFF]" />
              <span>{isBiometricSubmitting ? '생체인식 확인 중...' : '생체인식으로 로그인'}</span>
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

export default function MobileLoginPage() {
  const handleBiometricLogin = async () => {
    setError(null);
    setIsBiometricSubmitting(true);
    try {
      const res = await loginWithBiometric(email);
      if (res.success) {
        router.push('/mail/inbox');
      } else {
        setError(res.message || '생체인식 로그인에 실패했습니다.');
      }
    } catch (err: any) {
      setError(err.message || '생체인식 로그인 중 오류가 발생했습니다.');
    } finally {
      setIsBiometricSubmitting(false);
    }
  };

  return (
    <Suspense fallback={null}>
      <MobileLoginForm />
    </Suspense>
  );
}
