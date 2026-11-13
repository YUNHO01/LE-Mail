'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, PenSquare } from 'lucide-react';
import { useNavigation } from '../../contexts/NavigationContext';

interface MobileHeaderProps {
  onOpenDrawer: () => void;
}

function getHeaderTitle(pathname: string | null): string {
  if (!pathname) return 'LEMail';
  if (pathname.startsWith('/mail/inbox')) return '받은메일함';
  if (pathname.startsWith('/mail/sent')) return '보낸메일함';
  if (pathname.startsWith('/mail/drafts')) return '임시보관함';
  if (pathname.startsWith('/mail/spam')) return '스팸메일함';
  if (pathname.startsWith('/mail/trash')) return '휴지통';
  if (pathname.startsWith('/mail/compose')) return '메일 쓰기';
  if (pathname.startsWith('/mail/contacts')) return '주소록';
  if (pathname.startsWith('/mail/calendar')) return '캘린더';
  if (pathname.startsWith('/mail/settings')) return '환경설정';
  if (pathname.startsWith('/mail/folder')) return '개인 폴더';
  if (pathname.startsWith('/mail/')) return '메일 상세';
  return 'LEMail';
}

export const MobileHeader: React.FC<MobileHeaderProps> = ({ onOpenDrawer }) => {
  const pathname = usePathname();
  const { startNavigation } = useNavigation();
  const title = getHeaderTitle(pathname);

  // 메일 쓰기 화면은 자체 상단 네비게이션 바(취소 / 보내기)를 사용
  if (pathname === '/mail/compose') {
    return null;
  }

  const isMailFolder =
    pathname?.startsWith('/mail/inbox') ||
    pathname?.startsWith('/mail/sent') ||
    pathname?.startsWith('/mail/drafts') ||
    pathname?.startsWith('/mail/spam') ||
    pathname?.startsWith('/mail/trash') ||
    pathname?.startsWith('/mail/folder');

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-[#F2F2F7]/90 px-3 backdrop-blur-xl">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenDrawer}
          aria-label="메뉴 열기"
          className="flex h-10 w-10 items-center justify-center rounded-full text-slate-800 active:bg-slate-200/70"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="text-[20px] font-bold tracking-tight text-slate-900">{title}</h1>
      </div>

      {isMailFolder && (
        <Link
          href="/mail/compose"
          onClick={() => startNavigation('/mail/compose')}
          aria-label="메일 쓰기"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#007AFF]/10 text-[#007AFF] active:scale-95"
        >
          <PenSquare className="h-[18px] w-[18px]" />
        </Link>
      )}
    </header>
  );
};
