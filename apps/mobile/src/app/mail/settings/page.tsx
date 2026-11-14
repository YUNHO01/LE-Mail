'use client';

import React, { useState, Suspense } from 'react';
import {
  PenTool,
  ShieldBan,
  Archive,
  KeyRound,
  ChevronRight,
  ChevronLeft,
  LogOut,
  HardDrive,
  Fingerprint,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { SignatureSettingsTab } from '@/components/settings/SignatureSettingsTab';
import { SpamBlockSettingsTab } from '@/components/settings/SpamBlockSettingsTab';
import { MailboxBackupTab } from '@/components/settings/MailboxBackupTab';
import { PasswordChangeTab } from '@/components/settings/PasswordChangeTab';
import { BiometricSettingsTab } from '@/components/settings/BiometricSettingsTab';

type SettingsSection = 'menu' | 'signature' | 'spam' | 'backup' | 'password' | 'biometric';

const SECTION_META: Record<Exclude<SettingsSection, 'menu'>, string> = {
  signature: '서명 관리',
  spam: '스팸 및 수신 차단',
  backup: '메일함 백업',
  password: '비밀번호 변경',
  biometric: '생체인식 로그인',
};

function SettingsContent() {
  const { user, logout } = useAuth();
  const [section, setSection] = useState<SettingsSection>('menu');

  const quotaMb = user?.mailboxQuotaMb ?? 512;
  const usedMb = user?.usedMb ?? 0;
  const usagePercent =
    user?.usagePercent ??
    (quotaMb > 0 ? Math.min(100, Math.round((usedMb / quotaMb) * 100)) : 100);

  if (section !== 'menu') {
    return (
      <div className="px-3 pt-1 pb-8 space-y-3">
        <button
          type="button"
          onClick={() => setSection('menu')}
          className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#007AFF] shadow-xs border border-slate-200/70 active:scale-95"
        >
          <ChevronLeft className="h-4 w-4" />
          <span>환경설정</span>
        </button>

        <h2 className="px-1 text-lg font-bold text-slate-900">{SECTION_META[section]}</h2>

        <div className="rounded-2xl bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-slate-200/60">
          {section === 'signature' && <SignatureSettingsTab />}
          {section === 'spam' && <SpamBlockSettingsTab />}
          {section === 'backup' && <MailboxBackupTab />}
          {section === 'password' && <PasswordChangeTab />}
          {section === 'biometric' && <BiometricSettingsTab />}
        </div>
      </div>
    );
  }

  return (
    <div className="px-3 pt-1 pb-8 space-y-5">
      {/* 상단 프로필 & 사서함 용량 카드 */}
      <div className="rounded-2xl bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-slate-200/60 space-y-4">
        <div className="flex items-center gap-3.5">
          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-[#007AFF]/10 text-xl font-bold text-[#007AFF]">
            {(user?.name || 'U').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold text-slate-900">
              {user?.name || '사용자'}
            </p>
            <p className="truncate text-xs text-slate-500">{user?.email}</p>
          </div>
        </div>

        <div className="rounded-xl bg-[#F2F2F7] p-3">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 font-semibold text-slate-700">
              <HardDrive className="h-3.5 w-3.5 text-[#007AFF]" />
              사서함 용량
            </span>
            <span className="font-medium text-slate-500">
              {usedMb} MB / {quotaMb} MB ({usagePercent}%)
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-[#007AFF] transition-all"
              style={{ width: `${Math.min(100, usagePercent)}%` }}
            />
          </div>
        </div>
      </div>

      {/* 메일 설정 섹션 */}
      <div>
        <p className="mb-1.5 px-3 text-xs font-semibold text-slate-400">메일 설정</p>
        <div className="overflow-hidden rounded-2xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-slate-200/60 divide-y divide-slate-100">
          <button
            type="button"
            onClick={() => setSection('signature')}
            className="flex w-full items-center justify-between px-4 py-3.5 text-left active:bg-slate-50"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#007AFF] text-white">
                <PenTool className="h-4 w-4" />
              </span>
              <span className="text-sm font-semibold text-slate-900">서명 관리</span>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-300" />
          </button>

          <button
            type="button"
            onClick={() => setSection('spam')}
            className="flex w-full items-center justify-between px-4 py-3.5 text-left active:bg-slate-50"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500 text-white">
                <ShieldBan className="h-4 w-4" />
              </span>
              <span className="text-sm font-semibold text-slate-900">스팸 및 수신 차단</span>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-300" />
          </button>
        </div>
      </div>

      {/* 계정 및 보안 섹션 */}
      <div>
        <p className="mb-1.5 px-3 text-xs font-semibold text-slate-400">계정 및 보안</p>
        <div className="overflow-hidden rounded-2xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-slate-200/60 divide-y divide-slate-100">
          <button
            type="button"
            onClick={() => setSection('password')}
            className="flex w-full items-center justify-between px-4 py-3.5 text-left active:bg-slate-50"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-white">
                <KeyRound className="h-4 w-4" />
              </span>
              <span className="text-sm font-semibold text-slate-900">비밀번호 변경</span>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-300" />
          </button>

          <button
            type="button"
            onClick={() => setSection('biometric')}
            className="flex w-full items-center justify-between px-4 py-3.5 text-left active:bg-slate-50"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#007AFF] text-white">
                <Fingerprint className="h-4 w-4" />
              </span>
              <span className="text-sm font-semibold text-slate-900">생체인식 로그인</span>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-300" />
          </button>

          <button
            type="button"
            onClick={() => setSection('backup')}
            className="flex w-full items-center justify-between px-4 py-3.5 text-left active:bg-slate-50"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500 text-white">
                <Archive className="h-4 w-4" />
              </span>
              <span className="text-sm font-semibold text-slate-900">메일함 백업</span>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-300" />
          </button>
        </div>
      </div>

      {/* 로그아웃 카드 */}
      <button
        type="button"
        onClick={logout}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-3.5 text-sm font-bold text-rose-500 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-slate-200/60 active:bg-rose-50"
      >
        <LogOut className="h-4 w-4" />
        <span>로그아웃</span>
      </button>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsContent />
    </Suspense>
  );
}
