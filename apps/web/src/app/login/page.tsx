'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { Mail, Lock, ArrowRight, AlertCircle, ShieldCheck, Info } from 'lucide-react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const reason = searchParams.get('reason');
    if (reason === 'session_expired') {
      setInfoMessage('세션이 만료되었거나 인증이 해제되었습니다. 다시 로그인해 주세요.');
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
        if (res.user?.role === 'SYSTEM_ADMIN') {
          router.push('/admin/users');
        } else {
          router.push('/mail/inbox');
        }
      } else {
        setError(res.message || '로그인에 실패했습니다.');
      }
    } catch (err: any) {
      setError(err.message || '네트워크 연결 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFillAdmin = () => {
    setEmail('admin@lineedge.com');
    setPassword('admin1234!');
    setError(null);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4 py-12 sm:px-6">
      {/* Top Brand Header */}
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-500/25">
          <Mail className="h-8 w-8" />
        </div>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900">
          가장자리 메일 시스템
        </h1>
      </div>

      {/* Main Login Card */}
      <div className="w-full max-w-[420px] rounded-3xl border border-slate-200/80 bg-white p-8 shadow-xl sm:p-10">
        <div className="flex items-center gap-2 text-xl font-bold text-slate-900">
          <Lock className="h-5 w-5 text-blue-600" />
          <span>로그인</span>
        </div>

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
              이메일 또는 계정
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
            disabled={isSubmitting}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-sm font-semibold text-white shadow-md shadow-blue-600/30 transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:opacity-50"
          >
            {isSubmitting ? (
              <span>로그인 중...</span>
            ) : (
              <>
                <span>로그인</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        {/* Default Admin Quick Access Info */}
        <div className="mt-8 rounded-xl border border-slate-100 bg-slate-50/80 p-3.5 text-xs">
          <div className="flex items-center justify-between text-slate-700">
            <div className="flex items-center gap-1.5 font-semibold">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span>기본 관리자 계정</span>
            </div>
            <button
              type="button"
              onClick={handleFillAdmin}
              className="font-medium text-blue-600 hover:underline"
            >
              자동 입력
            </button>
          </div>
          <div className="mt-1.5 space-y-0.5 text-slate-500">
            <div>계정: <span className="font-mono text-slate-700">admin@lineedge.com</span></div>
            <div>비밀번호: <span className="font-mono text-slate-700">admin1234!</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-white text-slate-400 text-sm">
        로그인 페이지 로딩 중...
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
