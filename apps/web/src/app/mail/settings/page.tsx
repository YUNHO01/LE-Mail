'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { PenTool, ShieldBan, Archive, Settings, KeyRound, Bot, PlugZap, Bell } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { SignatureSettingsTab } from '@/components/settings/SignatureSettingsTab';
import { SpamBlockSettingsTab } from '@/components/settings/SpamBlockSettingsTab';
import { MailboxBackupTab } from '@/components/settings/MailboxBackupTab';
import { PasswordChangeTab } from '@/components/settings/PasswordChangeTab';
import { AiSettingsTab } from '@/components/settings/AiSettingsTab';
import { McpApiKeySettingsTab } from '@/components/settings/McpApiKeySettingsTab';
import { NotificationSettingsTab } from '@/components/settings/NotificationSettingsTab';
import { fetchApi } from '@/lib/api';
import { AiPolicyDto } from '@lemail/shared-types';

type SettingsTab = 'signature' | 'spam' | 'notifications' | 'backup' | 'password' | 'ai' | 'mcp';

function SettingsContent() {
  const searchParams = useSearchParams();

  const initialTab = (searchParams.get('tab') as SettingsTab) || 'signature';
  const validTabs: SettingsTab[] = ['signature', 'spam', 'notifications', 'backup', 'password', 'ai', 'mcp'];
  const [activeTab, setActiveTab] = useState<SettingsTab>(
    validTabs.includes(initialTab) ? initialTab : 'signature',
  );
  const [aiAllowed, setAiAllowed] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [pendingTab, setPendingTab] = useState<SettingsTab | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    fetchApi<AiPolicyDto>('/ai/policy')
      .then((pol) => setAiAllowed(Boolean(pol?.personalExternalAiEnabled)))
      .catch(() => setAiAllowed(false));
  }, []);

  useEffect(() => {
    const tabParam = searchParams.get('tab') as SettingsTab;
    if (tabParam && validTabs.includes(tabParam) && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  // 탭 전환 시 Next.js 라우터 대신 브라우저 히스토리를 갱신하여 페이지 스크롤 점프 및 상단 위치 이동 방지
  const commitTabChange = (tab: SettingsTab) => {
    setIsDirty(false);
    setPendingTab(null);
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

  const handleTabChange = (tab: SettingsTab, focusIdx?: number) => {
    if (tab === activeTab) return;
    if (isDirty) {
      setPendingTab(tab);
      return;
    }
    commitTabChange(tab);
    if (focusIdx !== undefined) {
      tabRefs.current[focusIdx]?.focus();
    }
  };

  const visibleTabs = [
    { id: 'signature' as const, label: '서명 설정', icon: PenTool },
    { id: 'spam' as const, label: '스팸 및 수신 차단', icon: ShieldBan },
    { id: 'notifications' as const, label: '알림 설정', icon: Bell },
    { id: 'backup' as const, label: '메일함 백업', icon: Archive },
    { id: 'password' as const, label: '비밀번호 변경', icon: KeyRound },
    ...(aiAllowed ? [{ id: 'ai' as const, label: 'AI 어시스턴트', icon: Bot }] : []),
    { id: 'mcp' as const, label: 'MCP 연동', icon: PlugZap },
  ];

  const handleTabKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const nextIdx =
      e.key === 'ArrowRight'
        ? (idx + 1) % visibleTabs.length
        : (idx - 1 + visibleTabs.length) % visibleTabs.length;
    handleTabChange(visibleTabs[nextIdx].id, nextIdx);
  };

  return (
    <div className="space-y-6 w-full max-w-4xl">
      {/* 표준 PageHeader */}
      <PageHeader
        title="환경설정"
        icon={<Settings className="h-6 w-6 text-[#0071e3]" />}
        subtitle="서명, 스팸 차단, 알림, 백업, 보안 및 외부 연동 설정을 관리합니다."
      />

      {/* 메인 탭 네비게이션 */}
      <div
        role="tablist"
        aria-label="환경설정 메뉴"
        className="flex items-center gap-1 overflow-x-auto whitespace-nowrap border-b border-black/[0.08]"
      >
        {visibleTabs.map((tab, idx) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[idx] = el;
              }}
              id={`settings-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`settings-tabpanel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => handleTabChange(tab.id)}
              onKeyDown={(e) => handleTabKeyDown(e, idx)}
              className={`inline-flex shrink-0 items-center gap-2 pb-3 px-3.5 text-sm font-semibold border-b-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3] ${
                isActive
                  ? 'border-[#0071e3] text-[#0071e3]'
                  : 'border-transparent text-[#6e6e73] hover:text-[#1d1d1f]'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 미저장 변경 경고 배너 */}
      {pendingTab && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#ff9500]/30 bg-[#ff9500]/10 px-4 py-3 text-xs">
          <span className="font-medium text-[#9c4200]">
            저장되지 않은 변경사항이 있습니다. 저장하지 않고 다른 탭으로 이동할까요?
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => commitTabChange(pendingTab)}
              className="rounded-lg bg-[#0071e3] px-3 py-1.5 font-semibold text-white hover:bg-[#0062c4] transition"
            >
              이동
            </button>
            <button
              type="button"
              onClick={() => setPendingTab(null)}
              className="rounded-lg px-2.5 py-1.5 font-medium text-[#6e6e73] hover:bg-black/[0.05] transition"
            >
              머무르기
            </button>
          </div>
        </div>
      )}

      {/* 탭 본문 영역 */}
      <div
        id={`settings-tabpanel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`settings-tab-${activeTab}`}
        className="w-full"
      >
        {activeTab === 'signature' && <SignatureSettingsTab onDirtyChange={setIsDirty} />}
        {activeTab === 'spam' && <SpamBlockSettingsTab />}
        {activeTab === 'notifications' && <NotificationSettingsTab />}
        {activeTab === 'backup' && <MailboxBackupTab />}
        {activeTab === 'password' && <PasswordChangeTab />}
        {activeTab === 'ai' && <AiSettingsTab onDirtyChange={setIsDirty} />}
        {activeTab === 'mcp' && <McpApiKeySettingsTab />}
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
