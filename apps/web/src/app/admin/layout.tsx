'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { ShieldAlert, ArrowLeft, LogIn } from 'lucide-react';
import Link from 'next/link';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isAuthenticated, isAdmin, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-400">
        관리자 권한을 확인하는 중...
      </div>
    );
  }

  // 1. 미인증 사용자 차단
  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
        <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 mb-4 border border-slate-700">
          <LogIn className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">관리자 로그인이 필요합니다</h2>
        <p className="text-sm text-slate-400 max-w-sm mb-6">
          시스템 관리 콘솔에 접근하려면 시스템 관리자 계정으로 로그인해 주세요.
        </p>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500"
        >
          로그인 페이지로 이동
        </Link>
      </div>
    );
  }

  // 2. 일반 사용자 차단 (관리자 권한 없음)
  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
        <div className="w-16 h-16 rounded-full bg-rose-950/50 border border-rose-800 flex items-center justify-center text-rose-400 mb-4">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">접근 권한이 없습니다 (403 Forbidden)</h2>
        <p className="text-sm text-slate-500 max-w-md mb-6 leading-relaxed">
          현재 로그인된 계정(<span className="font-semibold text-slate-700">{user?.email}</span>)은 일반 사용자 권한입니다.
          시스템 관리자 전용 페이지에는 접근할 수 없습니다.
        </p>
        <Link
          href="/mail/inbox"
          className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-sky-600/20 hover:bg-sky-500"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>사용자 웹메일로 이동</span>
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
