'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';

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
  const title = getHeaderTitle(pathname);

  const isMailDetail =
    /^\/mail\/(?!inbox|sent|drafts|spam|trash|compose|contacts|calendar|settings|folder|view)[^/]+$/.test(
      pathname || '',
    );

  // 메일 쓰기 / 메일 상세 화면은 자체 상단 네비게이션 바를 사용
  if (pathname === '/mail/compose' || isMailDetail) {
    return null;
  }

  return (
    <header className="sticky top-0 z-30 flex min-h-14 items-center justify-between bg-[#F2F2F7]/90 px-3 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <div className="flex h-14 items-center gap-2">
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
    </header>
  );
};
