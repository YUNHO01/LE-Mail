'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { PenTool, ShieldBan, Archive, Settings, KeyRound } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { SignatureSettingsTab } from '@/components/settings/SignatureSettingsTab';
import { SpamBlockSettingsTab } from '@/components/settings/SpamBlockSettingsTab';
import { MailboxBackupTab } from '@/components/settings/MailboxBackupTab';
import { PasswordChangeTab } from '@/components/settings/PasswordChangeTab';

type SettingsTab = 'signature' | 'spam' | 'backup' | 'password';

function SettingsContent() {
  const searchParams = useSearchParams();

  const initialTab = (searchParams.get('tab') as SettingsTab) || 'signature';
  const validTabs: SettingsTab[] = ['signature', 'spam', 'backup', 'password'];
  const [activeTab, setActiveTab] = useState<SettingsTab>(
    validTabs.includes(initialTab) ? initialTab : 'signature',
  );

  useEffect(() => {
    const tabParam = searchParams.get('tab') as SettingsTab;
    if (tabParam && validTabs.includes(tabParam) && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  // 탭 전환 시 Next.js 라우터 대신 브라우저 히스토리를 갱신하여 페이지 스크롤 점프 및 상단 위치 이동 방지
  const handleTabChange = (tab: SettingsTab) => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', tab);
      window.history.replaceState(null, '', url.toString());

      // 탭 전환 시 스크롤 컨테이너를 최상단으로 정돈하여 상단 위치 불일치 원천 차단
      const scrollParents = document.querySelectorAll('.overflow-y-auto');
      scrollParents.forEach((el) => {
        el.scrollTop = 0;
      });
      window.scrollTo(0, 0);
    }
  };

  return (
    <div className="space-y-6 w-full">
      {/* 메일함 목록과 동일한 표준 PageHeader 적용 */}
      <PageHeader
        title="환경설정"
        icon={<Settings className="h-6 w-6 text-sky-600" />}
        subtitle="개인 서명 작성, 스팸 및 수신 차단, 메일함 데이터 백업, 비밀번호 변경을 한곳에서 통합 관리합니다."
      />

      {/* 메인 탭 네비게이션 */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => handleTabChange('signature')}
          className={`flex items-center gap-2 pb-3.5 px-4 text-sm font-semibold border-b-2 transition ${
            activeTab === 'signature'
              ? 'border-sky-600 text-sky-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <PenTool className="h-4 w-4" />
          <span>서명 설정</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('spam')}
          className={`flex items-center gap-2 pb-3.5 px-4 text-sm font-semibold border-b-2 transition ${
            activeTab === 'spam'
              ? 'border-rose-600 text-rose-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ShieldBan className="h-4 w-4" />
          <span>스팸 및 수신 차단</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('backup')}
          className={`flex items-center gap-2 pb-3.5 px-4 text-sm font-semibold border-b-2 transition ${
            activeTab === 'backup'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Archive className="h-4 w-4" />
          <span>메일함 백업</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('password')}
          className={`flex items-center gap-2 pb-3.5 px-4 text-sm font-semibold border-b-2 transition ${
            activeTab === 'password'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <KeyRound className="h-4 w-4" />
          <span>비밀번호 변경</span>
        </button>
      </div>

      {/* 탭 본문 영역 (메일함 목록과 동일한 w-full 전폭 레이아웃) */}
      <div className="w-full">
        {activeTab === 'signature' && <SignatureSettingsTab />}
        {activeTab === 'spam' && <SpamBlockSettingsTab />}
        {activeTab === 'backup' && <MailboxBackupTab />}
        {activeTab === 'password' && <PasswordChangeTab />}
      </div>
    </div>
  );
}

export default function MailSettingsPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-xs text-slate-400">환경설정을 불러오는 중입니다...</div>}>
      <SettingsContent />
    </Suspense>
  );
}
