'use client';

import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { Search, UserPlus, Star, Mail, Users, X, Trash2, Building2, Tag, Edit, Phone } from 'lucide-react';
import { contactsApi, orgApi, DepartmentTreeNodeDto } from '@/lib/api';
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
  const [departmentTree, setDepartmentTree] = useState<DepartmentTreeNodeDto[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<string>('all');
  const [selectedPersonalGroupId, setSelectedPersonalGroupId] = useState<string>('all');
  const [groups, setGroups] = useState<ContactGroupDto[]>([]);
  const [loading, setLoading] = useState(true);

  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<ContactDto | null>(null);
  const [detailTarget, setDetailTarget] = useState<
    | { type: 'company'; user: UserDto }
    | { type: 'personal'; contact: ContactDto }
    | null
  >(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, uRes, gRes, treeRes] = await Promise.all([
        contactsApi.getContacts({ limit: 200 }).catch(() => ({ items: [] })),
        contactsApi.getCompanyUsers().catch(() => []),
        contactsApi.getGroups().catch(() => []),
        orgApi.getDepartmentTree().catch(() => []),
      ]);
      setContacts(cRes?.items || []);
      setCompanyUsers(Array.isArray(uRes) ? uRes : (uRes as any)?.items || []);
      setGroups(gRes || []);
      setDepartmentTree(Array.isArray(treeRes) ? treeRes : []);
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

  const { departmentFilterOptions, deptDescendantsMap } = useMemo(() => {
    const options: { value: string; label: string }[] = [{ value: 'all', label: '전체 부서' }];
    const descMap = new Map<string, Set<string>>();

    const collectDescendants = (node: DepartmentTreeNodeDto): Set<string> => {
      const ids = new Set<string>([node.id]);
      for (const child of node.children || []) {
        const childIds = collectDescendants(child);
        childIds.forEach((id) => ids.add(id));
      }
      descMap.set(node.id, ids);
      return ids;
    };

    const walk = (nodes: DepartmentTreeNodeDto[], depth = 0) => {
      for (const node of nodes) {
        options.push({
          value: node.id,
          label: depth > 0 ? `${'·'.repeat(depth)} ${node.name}` : node.name,
        });
        if (node.children?.length) walk(node.children, depth + 1);
      }
    };

    for (const root of departmentTree) collectDescendants(root);
    walk(departmentTree);

    if (companyUsers.some((u) => !u.departmentId)) {
      options.push({ value: 'unassigned', label: '소속 미지정' });
    }
    return { departmentFilterOptions: options, deptDescendantsMap: descMap };
  }, [departmentTree, companyUsers]);

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();

    const companyMapped = companyUsers
      .filter((u) => u.email)
      .filter((u) => {
        if (tab !== 'company') return true;
        if (selectedDeptId === 'unassigned') return !u.departmentId;
        if (selectedDeptId !== 'all') {
          const allowedIds = deptDescendantsMap.get(selectedDeptId);
          if (allowedIds) return Boolean(u.departmentId && allowedIds.has(u.departmentId));
          return u.departmentId === selectedDeptId;
        }
        return true;
      })
      .map((u) => {
        const deptLabel = u.departmentName || '소속 미지정';
        const posLabel = [u.position, u.jobTitle].filter(Boolean).join(' / ');
        return {
          key: `company-${u.id}`,
          id: u.id,
          isCompany: true,
          name: u.name || u.email.split('@')[0],
          posLabel,
          roleLabel: u.role === 'SYSTEM_ADMIN' ? '관리자' : '사내',
          email: u.email,
          groupLabel: deptLabel,
          subtitle: [deptLabel, u.email].join(' · '),
          searchText: [
            u.name,
            u.email,
            u.departmentName,
            u.position,
            u.jobTitle,
            u.employeeId,
            u.phone,
            u.mobile,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase(),
          isStarred: false,
          rawUser: u as UserDto | null,
          rawContact: null as ContactDto | null,
        };
      });

    const personalMapped = contacts
      .filter((c) => {
        if (tab !== 'personal') return true;
        if (selectedPersonalGroupId === 'unassigned') return !c.groupId;
        if (selectedPersonalGroupId !== 'all') return c.groupId === selectedPersonalGroupId;
        return true;
      })
      .map((c) => ({
        key: `personal-${c.id}`,
        id: c.id,
        isCompany: false,
        name: c.name || c.email || '이름 없음',
        posLabel: c.position || '',
        roleLabel: c.groupName || '',
        email: c.email || '',
        groupLabel: c.groupName || '미지정',
        subtitle: [c.company, c.department, c.email || c.phone].filter(Boolean).join(' · ') || '연락처 정보 없음',
        searchText: [c.name, c.email, c.company, c.department, c.position, c.phone, c.groupName]
          .filter(Boolean)
          .join(' ')
          .toLowerCase(),
        isStarred: Boolean(c.isStarred),
        rawUser: null as UserDto | null,
        rawContact: c as ContactDto | null,
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
      list = list.filter((item) => item.searchText.includes(q));
    }

    return list.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [companyUsers, contacts, tab, search, selectedDeptId, deptDescendantsMap, selectedPersonalGroupId]);

  const groupedSections = useMemo(() => {
    if (tab !== 'company' && tab !== 'personal') {
      return [{ label: '', items }];
    }
    const map = new Map<string, typeof items>();
    for (const item of items) {
      const key = item.groupLabel;
      const arr = map.get(key) || [];
      arr.push(item);
      map.set(key, arr);
    }
    return Array.from(map.entries()).map(([label, sectionItems]) => ({
      label,
      items: sectionItems,
    }));
  }, [items, tab]);

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
      <div className="no-scrollbar flex items-center gap-2 overflow-x-auto px-3 pb-2.5">
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

      {/* 하위 부서 / 개인 그룹 필터 칩 */}
      {tab === 'company' && departmentFilterOptions.length > 1 && (
        <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto px-3 pb-3">
          {departmentFilterOptions.map((opt) => {
            const active = selectedDeptId === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSelectedDeptId(opt.value)}
                className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                  active
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}

      {tab === 'personal' && (
        <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto px-3 pb-3">
          {[
            { id: 'all', name: '전체 그룹' },
            ...groups.map((g) => ({ id: g.id, name: g.name })),
            { id: 'unassigned', name: '미지정' },
          ].map((g) => {
            const active = selectedPersonalGroupId === g.id;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => setSelectedPersonalGroupId(g.id)}
                className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                  active
                    ? 'bg-slate-800 text-white'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {g.name}
              </button>
            );
          })}
        </div>
      )}

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
          <div>
            {groupedSections.map((section) => (
              <div key={section.label || 'default'}>
                {section.label && (
                  <div className="flex items-center justify-between bg-slate-50/90 px-3.5 py-1.5 border-y border-slate-100 text-[11px] font-semibold text-slate-500">
                    <span className="inline-flex items-center gap-1.5 truncate">
                      {tab === 'company' ? (
                        <Building2 className="h-3 w-3 text-[#007AFF] shrink-0" />
                      ) : (
                        <Tag className="h-3 w-3 text-slate-400 shrink-0" />
                      )}
                      <span className="truncate">{section.label}</span>
                    </span>
                    <span className="tabular-nums text-slate-400 shrink-0">{section.items.length}명</span>
                  </div>
                )}
                <div className="divide-y divide-slate-100">
                  {section.items.map((item) => (
                    <div
                      key={item.key}
                      onClick={() => {
                        if (item.isCompany && item.rawUser) {
                          setDetailTarget({ type: 'company', user: item.rawUser });
                        } else if (item.rawContact) {
                          setDetailTarget({ type: 'personal', contact: item.rawContact });
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
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">{item.name}</p>
                          {item.posLabel && (
                            <span className="truncate text-[11px] font-medium text-slate-500 shrink-0">
                              {item.posLabel}
                            </span>
                          )}
                          {item.isCompany ? (
                            <span className="rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-[#007AFF] shrink-0">
                              {item.roleLabel}
                            </span>
                          ) : (
                            item.roleLabel && (
                              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 shrink-0">
                                {item.roleLabel}
                              </span>
                            )
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
        className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-4 z-20 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#007AFF] text-white shadow-lg shadow-blue-500/35 active:scale-95 transition-transform"
      >
        <UserPlus className="h-6 w-6" />
      </button>

      {/* 그룹핑된 연락처 상세 보기 바텀시트 */}
      {detailTarget && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-[2px]"
          onClick={() => setDetailTarget(null)}
        >
          <div
            className="w-full max-w-lg max-h-[88vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[#f2f2f7] shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 상단 바 */}
            <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200/70">
              <span className="text-xs font-semibold text-slate-500">
                {detailTarget.type === 'company' ? '사내 임직원 정보' : '연락처 상세 정보'}
              </span>
              <div className="flex items-center gap-1.5">
                {detailTarget.type === 'personal' && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = detailTarget.contact;
                      setDetailTarget(null);
                      setSelectedContact(target);
                      setContactModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-[#007AFF]"
                  >
                    <Edit className="h-3 w-3" />
                    <span>편집</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDetailTarget(null)}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-500"
                  aria-label="닫기"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* 본문 */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {detailTarget.type === 'company' ? (
                (() => {
                  const u = detailTarget.user;
                  const tel = u.mobile || u.phone;
                  return (
                    <>
                      {/* 프로필 헤더 */}
                      <div className="flex items-center gap-3.5 bg-white rounded-2xl p-4 border border-slate-200/60">
                        <div
                          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-bold ${getAvatarColor(
                            u.name || u.email,
                          )}`}
                        >
                          {(u.name || 'U').charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h3 className="text-base font-bold text-slate-900">{u.name}</h3>
                            <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-[#007AFF]">
                              {u.role === 'SYSTEM_ADMIN' ? '시스템 관리자' : '사내 임직원'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5 truncate">
                            {[u.departmentName || '소속 미지정', u.position, u.jobTitle]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        </div>
                      </div>

                      {/* 빠른 액션 */}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setDetailTarget(null);
                            router.push(`/mail/compose?to=${encodeURIComponent(u.email)}`);
                          }}
                          className="flex items-center justify-center gap-1.5 rounded-xl bg-[#007AFF] py-2.5 text-xs font-semibold text-white"
                        >
                          <Mail className="h-3.5 w-3.5" />
                          <span>메일 쓰기</span>
                        </button>
                        {tel ? (
                          <a
                            href={`tel:${tel}`}
                            className="flex items-center justify-center gap-1.5 rounded-xl bg-white border border-slate-200 py-2.5 text-xs font-semibold text-slate-700"
                          >
                            <Phone className="h-3.5 w-3.5 text-emerald-600" />
                            <span>전화 걸기</span>
                          </a>
                        ) : (
                          <div className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-100 py-2.5 text-xs font-medium text-slate-400">
                            <Phone className="h-3.5 w-3.5" />
                            <span>전화번호 없음</span>
                          </div>
                        )}
                      </div>

                      {/* 카드 1: 연락처 정보 */}
                      <div className="rounded-2xl bg-white border border-slate-200/60 overflow-hidden">
                        <div className="px-4 py-2 bg-slate-50/70 border-b border-slate-100 text-[11px] font-semibold text-slate-500">
                          연락처 정보
                        </div>
                        <div className="divide-y divide-slate-100 text-xs">
                          <div className="px-4 py-2.5 flex items-center justify-between gap-3">
                            <span className="text-slate-400 shrink-0">이메일</span>
                            <span className="text-[#007AFF] font-medium truncate">{u.email}</span>
                          </div>
                          <div className="px-4 py-2.5 flex items-center justify-between gap-3">
                            <span className="text-slate-400 shrink-0">휴대전화</span>
                            <span className="text-slate-800 tabular-nums">{u.mobile || '-'}</span>
                          </div>
                          <div className="px-4 py-2.5 flex items-center justify-between gap-3">
                            <span className="text-slate-400 shrink-0">회사/내선전화</span>
                            <span className="text-slate-800 tabular-nums">{u.phone || '-'}</span>
                          </div>
                        </div>
                      </div>

                      {/* 카드 2: 소속 및 직무 정보 */}
                      <div className="rounded-2xl bg-white border border-slate-200/60 overflow-hidden">
                        <div className="px-4 py-2 bg-slate-50/70 border-b border-slate-100 text-[11px] font-semibold text-slate-500">
                          소속 및 직무 정보
                        </div>
                        <div className="divide-y divide-slate-100 text-xs">
                          <div className="px-4 py-2.5 flex items-center justify-between gap-3">
                            <span className="text-slate-400 shrink-0">소속 부서</span>
                            <span className="text-slate-800">{u.departmentName || '소속 미지정'}</span>
                          </div>
                          <div className="px-4 py-2.5 flex items-center justify-between gap-3">
                            <span className="text-slate-400 shrink-0">직급</span>
                            <span className="text-slate-800">{u.position || '-'}</span>
                          </div>
                          <div className="px-4 py-2.5 flex items-center justify-between gap-3">
                            <span className="text-slate-400 shrink-0">직책</span>
                            <span className="text-slate-800">{u.jobTitle || '-'}</span>
                          </div>
                          <div className="px-4 py-2.5 flex items-center justify-between gap-3">
                            <span className="text-slate-400 shrink-0">사번</span>
                            <span className="text-slate-800 tabular-nums">{u.employeeId || '-'}</span>
                          </div>
                          <div className="px-4 py-2.5 flex items-center justify-between gap-3">
                            <span className="text-slate-400 shrink-0">재직상태</span>
                            <span className="text-slate-800">
                              {u.employmentStatus === 'ON_LEAVE'
                                ? '휴직'
                                : u.employmentStatus === 'RESIGNED'
                                ? '퇴직'
                                : '재직'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </>
                  );
                })()
              ) : (
                (() => {
                  const c = detailTarget.contact;
                  const tel = c.phone || c.companyPhone;
                  return (
                    <>
                      {/* 프로필 헤더 */}
                      <div className="flex items-center gap-3.5 bg-white rounded-2xl p-4 border border-slate-200/60">
                        <div
                          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-bold ${getAvatarColor(
                            c.name || c.email || 'C',
                          )}`}
                        >
                          {(c.name || c.email || 'C').charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h3 className="text-base font-bold text-slate-900">{c.name || '-'}</h3>
                            {c.groupName && (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                                {c.groupName}
                              </span>
                            )}
                          </div>
                          {(c.company || c.department || c.position) && (
                            <p className="text-xs text-slate-500 mt-0.5 truncate">
                              {[c.company, c.department, c.position].filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* 빠른 액션 */}
                      <div className="grid grid-cols-2 gap-2">
                        {c.email ? (
                          <button
                            type="button"
                            onClick={() => {
                              setDetailTarget(null);
                              router.push(`/mail/compose?to=${encodeURIComponent(c.email!)}`);
                            }}
                            className="flex items-center justify-center gap-1.5 rounded-xl bg-[#007AFF] py-2.5 text-xs font-semibold text-white"
                          >
                            <Mail className="h-3.5 w-3.5" />
                            <span>메일 쓰기</span>
                          </button>
                        ) : (
                          <div className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-100 py-2.5 text-xs font-medium text-slate-400">
                            <Mail className="h-3.5 w-3.5" />
                            <span>이메일 없음</span>
                          </div>
                        )}
                        {tel ? (
                          <a
                            href={`tel:${tel}`}
                            className="flex items-center justify-center gap-1.5 rounded-xl bg-white border border-slate-200 py-2.5 text-xs font-semibold text-slate-700"
                          >
                            <Phone className="h-3.5 w-3.5 text-emerald-600" />
                            <span>전화 걸기</span>
                          </a>
                        ) : (
                          <div className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-100 py-2.5 text-xs font-medium text-slate-400">
                            <Phone className="h-3.5 w-3.5" />
                            <span>전화번호 없음</span>
                          </div>
                        )}
                      </div>

                      {/* 카드 1: 연락처 정보 */}
                      <div className="rounded-2xl bg-white border border-slate-200/60 overflow-hidden">
                        <div className="px-4 py-2 bg-slate-50/70 border-b border-slate-100 text-[11px] font-semibold text-slate-500">
                          연락처 정보
                        </div>
                        <div className="divide-y divide-slate-100 text-xs">
                          <div className="px-4 py-2.5 flex items-center justify-between gap-3">
                            <span className="text-slate-400 shrink-0">이메일</span>
                            <span className="text-slate-800 truncate">{c.email || '-'}</span>
                          </div>
                          <div className="px-4 py-2.5 flex items-center justify-between gap-3">
                            <span className="text-slate-400 shrink-0">휴대전화</span>
                            <span className="text-slate-800 tabular-nums">{c.phone || '-'}</span>
                          </div>
                          <div className="px-4 py-2.5 flex items-center justify-between gap-3">
                            <span className="text-slate-400 shrink-0">회사전화</span>
                            <span className="text-slate-800 tabular-nums">{c.companyPhone || '-'}</span>
                          </div>
                          <div className="px-4 py-2.5 flex items-center justify-between gap-3">
                            <span className="text-slate-400 shrink-0">팩스</span>
                            <span className="text-slate-800 tabular-nums">{c.companyFax || '-'}</span>
                          </div>
                        </div>
                      </div>

                      {/* 카드 2: 소속 및 기타 정보 */}
                      <div className="rounded-2xl bg-white border border-slate-200/60 overflow-hidden">
                        <div className="px-4 py-2 bg-slate-50/70 border-b border-slate-100 text-[11px] font-semibold text-slate-500">
                          소속 및 기타 정보
                        </div>
                        <div className="divide-y divide-slate-100 text-xs">
                          <div className="px-4 py-2.5 flex items-center justify-between gap-3">
                            <span className="text-slate-400 shrink-0">회사명</span>
                            <span className="text-slate-800">{c.company || '-'}</span>
                          </div>
                          <div className="px-4 py-2.5 flex items-center justify-between gap-3">
                            <span className="text-slate-400 shrink-0">부서명</span>
                            <span className="text-slate-800">{c.department || '-'}</span>
                          </div>
                          <div className="px-4 py-2.5 flex items-center justify-between gap-3">
                            <span className="text-slate-400 shrink-0">직책</span>
                            <span className="text-slate-800">{c.position || '-'}</span>
                          </div>
                          <div className="px-4 py-2.5 flex items-center justify-between gap-3">
                            <span className="text-slate-400 shrink-0">그룹</span>
                            <span className="text-slate-800">{c.groupName || '미지정'}</span>
                          </div>
                          <div className="px-4 py-2.5 flex items-center justify-between gap-3">
                            <span className="text-slate-400 shrink-0">생일</span>
                            <span className="text-slate-800 tabular-nums">{c.birthday || '-'}</span>
                          </div>
                        </div>
                      </div>

                      {/* 카드 3: 주소 */}
                      {(c.postalCode || c.address || c.addressDetail) && (
                        <div className="rounded-2xl bg-white border border-slate-200/60 overflow-hidden">
                          <div className="px-4 py-2 bg-slate-50/70 border-b border-slate-100 text-[11px] font-semibold text-slate-500">
                            주소
                          </div>
                          <div className="divide-y divide-slate-100 text-xs">
                            <div className="px-4 py-2.5 flex items-center justify-between gap-3">
                              <span className="text-slate-400 shrink-0">우편번호</span>
                              <span className="text-slate-800 tabular-nums">{c.postalCode || '-'}</span>
                            </div>
                            <div className="px-4 py-2.5 flex items-start justify-between gap-3">
                              <span className="text-slate-400 shrink-0">주소</span>
                              <span className="text-slate-800 text-right">
                                {[c.address, c.addressDetail].filter(Boolean).join(' ') || '-'}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 카드 4: 메모 */}
                      {c.memo && (
                        <div className="rounded-2xl bg-white border border-slate-200/60 overflow-hidden">
                          <div className="px-4 py-2 bg-slate-50/70 border-b border-slate-100 text-[11px] font-semibold text-slate-500">
                            메모
                          </div>
                          <div className="p-4 text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                            {c.memo}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()
              )}
            </div>
          </div>
        </div>
      )}

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
