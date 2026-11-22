import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  UserCog,
  Mail,
  Globe,
  Layers,
  ShieldAlert,
  Filter,
  Settings,
  KeyRound,
  CalendarDays,
  Building2,
  Award,
} from 'lucide-react';

export interface ConsoleNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
}

export interface ConsoleNavGroup {
  id: string;
  label: string;
  items: ConsoleNavItem[];
}

/**
 * 상단 고정 메뉴 (그룹 접힘 상태와 무관하게 항상 노출)
 */
export const CONSOLE_TOP_ITEMS: ConsoleNavItem[] = [
  {
    href: '/dashboard',
    label: '모니터링 대시보드',
    icon: Activity,
  },
];

/**
 * 관리자 콘솔 그룹별 메뉴 정의
 * 신규 메뉴 추가 시 해당 그룹의 items에 추가하거나 새 그룹을 등록합니다.
 */
export const CONSOLE_NAV_GROUPS: ConsoleNavGroup[] = [
  {
    id: 'organization',
    label: '조직',
    items: [
      {
        href: '/users',
        label: '조직 관리',
        icon: UserCog,
      },
      {
        href: '/positions',
        label: '직급/직책 관리',
        icon: Award,
      },
      {
        href: '/org',
        label: '외부 조직도 연동',
        icon: Building2,
      },
    ],
  },
  {
    id: 'mail',
    label: '메일',
    items: [
      {
        href: '/domains',
        label: '도메인 관리',
        icon: Globe,
      },
      {
        href: '/mailboxes',
        label: '사서함 관리',
        icon: Mail,
      },
    ],
  },
  {
    id: 'security',
    label: '보안 및 로그',
    items: [
      {
        href: '/logs',
        label: '수신 및 보안 로그',
        icon: Layers,
      },
      {
        href: '/quarantine',
        label: '스팸 격리함 관리',
        icon: ShieldAlert,
      },
      {
        href: '/spam-rules',
        label: '스팸 차단 및 필터 정책',
        icon: Filter,
      },
    ],
  },
  {
    id: 'system',
    label: '시스템',
    items: [
      {
        href: '/settings',
        label: '시스템 환경설정',
        icon: Settings,
      },
      {
        href: '/holidays',
        label: '공휴일 관리',
        icon: CalendarDays,
      },
      {
        href: '/license',
        label: '라이선스 관리',
        icon: KeyRound,
      },
    ],
  },
];
