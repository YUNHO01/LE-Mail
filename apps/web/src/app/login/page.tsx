'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { Mail, Lock, LogIn, AlertCircle, ShieldCheck } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const res = await login(email, password);
      if (res.success) {
        router.push('/admin/users');
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
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 rounded-2xl bg-white p-8 shadow-2xl sm:p-10">
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-600 text-white shadow-lg shadow-sky-500/30">
            <Mail className="h-7 w-7" />
          </div>
          <h2 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">
            LEMail 콘솔 로그인
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            엔터프라이즈 SMTP 메일 시스템 계정으로 로그인하세요.
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2.5 rounded-lg border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-700">
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-rose-500" />
            <span>{error}</span>
          </div>
        )}

        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
              이메일 주소
            </label>
            <div className="relative mt-1.5">
              <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@lineedge.com"
                className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
              비밀번호
            </label>
            <div className="relative mt-1.5">
              <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 py-3 text-sm font-semibold text-white shadow-md shadow-sky-600/30 transition hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500/40 disabled:opacity-50"
          >
            {isSubmitting ? (
              <span>로그인 중...</span>
            ) : (
              <>
                <LogIn className="h-4 w-4" />
                <span>로그인</span>
              </>
            )}
          </button>
        </form>

        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span>기본 시스템 관리자 계정</span>
            </div>
            <button
              type="button"
              onClick={handleFillAdmin}
              className="text-xs font-medium text-sky-600 hover:underline"
            >
              자동 입력
            </button>
          </div>
          <div className="mt-2 text-xs text-slate-500 space-y-0.5">
            <div>계정: <span className="font-mono text-slate-700">admin@lineedge.com</span></div>
            <div>비밀번호: <span className="font-mono text-slate-700">admin1234!</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
