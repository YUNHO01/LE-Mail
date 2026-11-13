'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, X, Check } from 'lucide-react';
import { contactsApi } from '@/lib/api';
import { ContactDto, UserDto } from '@lemail/shared-types';
import { extractPureEmail } from './RecipientInput';

export type RecipientTarget = 'to' | 'cc' | 'bcc';

export interface RecipientEntry {
  name?: string | null;
  email: string;
}

interface ComposeAddressBookPanelProps {
  to: string[];
  cc: string[];
  bcc: string[];
  defaultTarget?: RecipientTarget;
  onToggleRecipient: (target: RecipientTarget, entry: RecipientEntry) => void;
  onAddRecipientsBulk: (target: RecipientTarget, entries: RecipientEntry[]) => void;
  onClose?: () => void;
  className?: string;
}

const AVATAR_COLORS = [
  'bg-sky-100 text-sky-700',
  'bg-indigo-100 text-indigo-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
];

function getAvatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export const ComposeAddressBookPanel: React.FC<ComposeAddressBookPanelProps> = ({
  to,
  cc,
  bcc,
  defaultTarget = 'to',
  onToggleRecipient,
  onClose,
}) => {
  const [target, setTarget] = useState<RecipientTarget>(defaultTarget);
  const [filterTab, setFilterTab] = useState<'all' | 'company' | 'personal' | 'starred'>('company');
  const [searchInput, setSearchInput] = useState('');
  const [contacts, setContacts] = useState<ContactDto[]>([]);
  const [companyUsers, setCompanyUsers] = useState<UserDto[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, uRes] = await Promise.all([
        contactsApi.getContacts({ limit: 100 }).catch(() => ({ items: [] })),
        contactsApi.getCompanyUsers().catch(() => []),
      ]);
      setContacts(cRes?.items || []);
      setCompanyUsers(Array.isArray(uRes) ? uRes : (uRes as any)?.items || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const currentList = useMemo(() => {
    if (target === 'to') return to;
    if (target === 'cc') return cc;
    return bcc;
  }, [target, to, cc, bcc]);

  const selectedEmailSet = useMemo(() => {
    return new Set(currentList.map((raw) => extractPureEmail(raw).toLowerCase()));
  }, [currentList]);

  const combinedItems = useMemo(() => {
    const q = searchInput.trim().toLowerCase();

    const companyMapped = companyUsers
      .filter((u) => u.email)
      .map((u) => ({
        id: `company-${u.id}`,
        source: 'company' as const,
        name: u.name || u.email.split('@')[0],
        email: u.email,
        subtitle: [u.departmentName, u.position || u.jobTitle].filter(Boolean).join(' · ') || u.email,
        isStarred: false,
      }));

    const personalMapped = contacts
      .filter((c) => c.email)
      .map((c) => ({
        id: `personal-${c.id}`,
        source: 'personal' as const,
        name: c.name || c.email!.split('@')[0],
        email: c.email!,
        subtitle: [c.company, c.department, c.email].filter(Boolean).join(' · '),
        isStarred: Boolean(c.isStarred),
      }));

    let base =
      filterTab === 'company'
        ? companyMapped
        : filterTab === 'personal'
        ? personalMapped
        : filterTab === 'starred'
        ? personalMapped.filter((c) => c.isStarred)
        : [...companyMapped, ...personalMapped];

    if (q) {
      base = base.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.email.toLowerCase().includes(q) ||
          item.subtitle.toLowerCase().includes(q),
      );
    }
    return base;
  }, [companyUsers, contacts, filterTab, searchInput]);

  return (
    <div className="flex h-[86dvh] w-full flex-col rounded-t-3xl bg-white shadow-2xl">
      {/* 드래그 핸들 */}
      <div className="flex justify-center pt-2.5 pb-1">
        <div className="h-1 w-10 rounded-full bg-slate-300" />
      </div>

      {/* 헤더 */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
        <button
          type="button"
          onClick={onClose}
          className="text-sm font-medium text-slate-500 active:text-slate-800"
        >
          취소
        </button>

        <div className="flex items-center gap-1 rounded-full bg-slate-100 p-0.5">
          {([
            { key: 'to', label: '받는사람' },
            { key: 'cc', label: '참조' },
            { key: 'bcc', label: '숨은참조' },
          ] as const).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTarget(t.key)}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                target === t.key ? 'bg-white text-[#007AFF] shadow-sm' : 'text-slate-500'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="text-sm font-bold text-[#007AFF]"
        >
          완료 ({currentList.length})
        </button>
      </div>

      {/* 선택된 수신자 칩 */}
      {currentList.length > 0 && (
        <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto border-b border-slate-100 bg-slate-50/70 px-4 py-2">
          {currentList.map((raw) => {
            const pure = extractPureEmail(raw);
            const label = raw.includes('<') ? raw.split('<')[0].trim() : pure;
            return (
              <button
                key={raw}
                type="button"
                onClick={() => onToggleRecipient(target, { name: label, email: pure })}
                className="flex flex-shrink-0 items-center gap-1 rounded-full bg-[#007AFF]/10 px-2.5 py-1 text-xs font-semibold text-[#007AFF]"
              >
                <span>{label}</span>
                <X className="h-3 w-3" />
              </button>
            );
          })}
        </div>
      )}

      {/* 검색 & 세그먼트 필터 */}
      <div className="space-y-2.5 px-4 pt-3 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="이름, 이메일, 부서 검색"
            className="w-full rounded-full bg-slate-100 py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20"
          />
        </div>

        <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto">
          {[
            { key: 'all', label: '전체' },
            { key: 'company', label: '사내 조직도' },
            { key: 'personal', label: '개인 주소록' },
            { key: 'starred', label: '즐겨찾기' },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilterTab(tab.key as any)}
              className={`flex-shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                filterTab === tab.key
                  ? 'bg-[#007AFF] text-white'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 연락처 리스트 */}
      <div className="flex-1 overflow-y-auto px-4 divide-y divide-slate-100">
        {loading ? (
          <div className="py-12 text-center text-xs text-slate-400">주소록을 불러오는 중...</div>
        ) : combinedItems.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">일치하는 연락처가 없습니다.</div>
        ) : (
          combinedItems.map((item) => {
            const isSelected = selectedEmailSet.has(item.email.toLowerCase());
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onToggleRecipient(target, { name: item.name, email: item.email })}
                className="flex w-full items-center gap-3 py-3 text-left active:bg-slate-50"
              >
                <span
                  className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border transition ${
                    isSelected
                      ? 'border-[#007AFF] bg-[#007AFF] text-white'
                      : 'border-slate-300 bg-white'
                  }`}
                >
                  {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                </span>

                <span
                  className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${getAvatarColor(
                    item.name,
                  )}`}
                >
                  {item.name.charAt(0).toUpperCase()}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{item.name}</p>
                  <p className="truncate text-xs text-slate-500">{item.subtitle}</p>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* 하단 CTA */}
      <div className="border-t border-slate-100 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-2xl bg-[#007AFF] py-3.5 text-sm font-bold text-white shadow-md shadow-blue-500/25 active:scale-[0.99]"
        >
          {currentList.length}명 선택 완료
        </button>
      </div>
    </div>
  );
};
