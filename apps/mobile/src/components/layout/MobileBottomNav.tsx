'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Mail, PenSquare, Users, Calendar, Settings } from 'lucide-react';
import { useNavigation } from '../../contexts/NavigationContext';

const NAV_ITEMS = [
  {
    href: '/mail/inbox',
    label: '메일',
    icon: Mail,
    match: (p: string) =>
      p.startsWith('/mail') &&
      !p.startsWith('/mail/compose') &&
      !p.startsWith('/mail/contacts') &&
      !p.startsWith('/mail/calendar') &&
      !p.startsWith('/mail/settings'),
  },
  {
    href: '/mail/compose',
    label: '쓰기',
    icon: PenSquare,
    match: (p: string) => p.startsWith('/mail/compose'),
  },
  {
    href: '/mail/contacts',
    label: '주소록',
    icon: Users,
    match: (p: string) => p.startsWith('/mail/contacts'),
  },
  {
    href: '/mail/calendar',
    label: '캘린더',
    icon: Calendar,
    match: (p: string) => p.startsWith('/mail/calendar'),
  },
  {
    href: '/mail/settings',
    label: '설정',
    icon: Settings,
    match: (p: string) => p.startsWith('/mail/settings'),
  },
];

export const MobileBottomNav: React.FC = () => {
  const pathname = usePathname() || '';
  const { startNavigation } = useNavigation();

  const isMailDetail =
    /^\/mail\/(?!inbox|sent|drafts|spam|trash|compose|contacts|calendar|settings|folder|view)[^/]+$/.test(
      pathname,
    );

  if (pathname.startsWith('/mail/compose') || isMailDetail) {
    return null;
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200/80 bg-white/85 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]">
      <div className="grid h-14 grid-cols-5">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = item.match(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => startNavigation(item.href)}
              className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-colors ${
                active ? 'text-[#007AFF]' : 'text-slate-400 active:text-slate-700'
              }`}
            >
              <Icon className={`h-[21px] w-[21px] ${active ? 'stroke-[2.25]' : 'stroke-[1.75]'}`} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};
