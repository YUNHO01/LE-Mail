'use client';

import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { Search, UserPlus, Star, Mail, Users, X, Trash2 } from 'lucide-react';
import { contactsApi } from '@/lib/api';
import { ContactDto, ContactGroupDto, UserDto } from '@lemail/shared-types';
import { ContactModal } from '@/components/contacts/ContactModal';

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

function ContactsContent() {
  const router = useRouter();
  const [tab, setTab] = useState<'all' | 'company' | 'personal' | 'starred'>('all');
  const [search, setSearch] = useState('');
  const [contacts, setContacts] = useState<ContactDto[]>([]);
  const [companyUsers, setCompanyUsers] = useState<UserDto[]>([]);
  const [groups, setGroups] = useState<ContactGroupDto[]>([]);
  const [loading, setLoading] = useState(true);

  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<ContactDto | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, uRes, gRes] = await Promise.all([
        contactsApi.getContacts({ limit: 200 }).catch(() => ({ items: [] })),
        contactsApi.getCompanyUsers().catch(() => []),
        contactsApi.getGroups().catch(() => []),
      ]);
      setContacts(cRes?.items || []);
      setCompanyUsers(Array.isArray(uRes) ? uRes : (uRes as any)?.items || []);
      setGroups(gRes || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggleStar = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await contactsApi.toggleStar(id);
      setContacts((prev) =>
        prev.map((c) => (c.id === id ? { ...c, isStarred: !c.isStarred } : c)),
      );
    } catch {
      // ignore
    }
  };

  const handleDeleteContact = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (!confirm(`'${name}' 연락처를 삭제하시겠습니까?`)) return;
    try {
      await contactsApi.deleteContact(id);
      setContacts((prev) => prev.filter((c) => c.id !== id));
    } catch (err: any) {
      alert(err?.message || '연락처 삭제에 실패했습니다.');
    }
  };

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();

    const companyMapped = companyUsers
      .filter((u) => u.email)
      .map((u) => ({
        key: `company-${u.id}`,
        id: u.id,
        isCompany: true,
        name: u.name || u.email.split('@')[0],
        email: u.email,
        subtitle: [u.departmentName, u.position || u.jobTitle].filter(Boolean).join(' · ') || u.email,
        isStarred: false,
        rawContact: null as ContactDto | null,
      }));

    const personalMapped = contacts.map((c) => ({
      key: `personal-${c.id}`,
      id: c.id,
      isCompany: false,
      name: c.name || c.email || '이름 없음',
      email: c.email || '',
      subtitle: [c.company, c.department, c.email].filter(Boolean).join(' · '),
      isStarred: Boolean(c.isStarred),
      rawContact: c,
    }));

    let list =
      tab === 'company'
        ? companyMapped
        : tab === 'personal'
        ? personalMapped
        : tab === 'starred'
        ? personalMapped.filter((c) => c.isStarred)
        : [...companyMapped, ...personalMapped];

    if (q) {
      list = list.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.email.toLowerCase().includes(q) ||
          item.subtitle.toLowerCase().includes(q),
      );
    }

    return list.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [companyUsers, contacts, tab, search]);

  return (
    <div className="pb-6">
      {/* 검색바 */}
      <div className="px-3 pt-1 pb-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="이름, 이메일, 부서 검색"
            className="w-full rounded-full bg-white/90 py-2.5 pl-10 pr-9 text-sm text-slate-900 placeholder-slate-400 shadow-[0_1px_2px_rgba(0,0,0,0.04)] border border-slate-200/70 focus:border-[#007AFF] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/15"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-slate-200 p-0.5 text-slate-500"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* 세그먼트 필터 */}
      <div className="no-scrollbar flex items-center gap-2 overflow-x-auto px-3 pb-3">
        {[
          { key: 'all', label: '전체' },
          { key: 'company', label: '사내 조직도' },
          { key: 'personal', label: '개인 주소록' },
          { key: 'starred', label: '즐겨찾기' },
        ].map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key as any)}
              className={`flex-shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                active
                  ? 'bg-[#007AFF] text-white shadow-sm shadow-blue-500/25'
                  : 'bg-white text-slate-600 border border-slate-200/80'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* 연락처 인셋 그룹 카드 */}
      <div className="mx-3 overflow-hidden rounded-2xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-slate-200/60">
        {loading ? (
          <div className="divide-y divide-slate-100">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3 p-3.5 animate-pulse">
                <div className="h-10 w-10 rounded-full bg-slate-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-28 rounded bg-slate-200" />
                  <div className="h-3 w-44 rounded bg-slate-100" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <Users className="h-6 w-6" />
            </div>
            <p className="text-sm font-semibold text-slate-700">표시할 연락처가 없습니다.</p>
            <p className="mt-1 text-xs text-slate-400">우측 하단 버튼으로 새 연락처를 추가해 보세요.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map((item) => (
              <div
                key={item.key}
                onClick={() => {
                  if (item.rawContact) {
                    setSelectedContact(item.rawContact);
                    setContactModalOpen(true);
                  }
                }}
                className="flex items-center gap-3 px-3.5 py-3 active:bg-slate-50 cursor-pointer"
              >
                <div
                  className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold ${getAvatarColor(
                    item.name,
                  )}`}
                >
                  {item.name.charAt(0).toUpperCase()}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-semibold text-slate-900">{item.name}</p>
                    {item.isCompany && (
                      <span className="rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-[#007AFF]">
                        사내
                      </span>
                    )}
                  </div>
                  <p className="truncate text-xs text-slate-500">{item.subtitle}</p>
                </div>

                <div className="flex flex-shrink-0 items-center gap-1">
                  {item.email && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/mail/compose?to=${encodeURIComponent(item.email)}`);
                      }}
                      aria-label="메일 보내기"
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-[#007AFF] active:scale-95"
                    >
                      <Mail className="h-3.5 w-3.5" />
                    </button>
                  )}

                  {!item.isCompany && (
                    <>
                      <button
                        type="button"
                        onClick={(e) => handleToggleStar(e, item.id)}
                        aria-label="즐겨찾기"
                        className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400"
                      >
                        <Star
                          className={`h-4 w-4 ${
                            item.isStarred ? 'fill-amber-400 text-amber-400' : 'text-slate-300'
                          }`}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteContact(e, item.id, item.name)}
                        aria-label="삭제"
                        className="flex h-8 w-8 items-center justify-center rounded-full text-slate-300 hover:text-rose-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 플로팅 연락처 추가 버튼 */}
      <button
        type="button"
        onClick={() => {
          setSelectedContact(null);
          setContactModalOpen(true);
        }}
        aria-label="새 연락처 추가"
        className="fixed bottom-20 right-4 z-20 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#007AFF] text-white shadow-lg shadow-blue-500/35 active:scale-95 transition-transform"
      >
        <UserPlus className="h-6 w-6" />
      </button>

      {contactModalOpen && (
        <ContactModal
          isOpen={contactModalOpen}
          contact={selectedContact}
          groups={groups}
          onClose={() => {
            setContactModalOpen(false);
            setSelectedContact(null);
          }}
          onSaved={() => {
            setContactModalOpen(false);
            setSelectedContact(null);
            loadData();
          }}
        />
      )}
    </div>
  );
}

export default function ContactsPage() {
  return (
    <Suspense fallback={null}>
      <ContactsContent />
    </Suspense>
  );
}
