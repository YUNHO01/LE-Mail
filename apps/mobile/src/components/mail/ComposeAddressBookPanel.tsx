'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, X, Check, Building2 } from 'lucide-react';
import { contactsApi, orgApi, DepartmentTreeNodeDto } from '@/lib/api';
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
  const [departmentTree, setDepartmentTree] = useState<DepartmentTreeNodeDto[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, uRes, treeRes] = await Promise.all([
        contactsApi.getContacts({ limit: 100 }).catch(() => ({ items: [] })),
        contactsApi.getCompanyUsers().catch(() => []),
        orgApi.getDepartmentTree().catch(() => []),
      ]);
      setContacts(cRes?.items || []);
      setCompanyUsers(Array.isArray(uRes) ? uRes : (uRes as any)?.items || []);
      setDepartmentTree(Array.isArray(treeRes) ? treeRes : []);
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

  const combinedItems = useMemo(() => {
    const q = searchInput.trim().toLowerCase();

    const companyMapped = companyUsers
      .filter((u) => u.email)
      .filter((u) => {
        if (filterTab !== 'company') return true;
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
          id: `company-${u.id}`,
          source: 'company' as const,
          name: u.name || u.email.split('@')[0],
          posLabel,
          roleLabel: u.role === 'SYSTEM_ADMIN' ? '관리자' : '사내',
          email: u.email,
          departmentLabel: deptLabel,
          subtitle: [deptLabel, u.email].join(' · '),
          searchText: [
            u.name,
            u.email,
            u.departmentName,
            u.position,
            u.jobTitle,
            u.employeeId,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase(),
          isStarred: false,
        };
      });

    const personalMapped = contacts
      .filter((c) => c.email)
      .map((c) => ({
        id: `personal-${c.id}`,
        source: 'personal' as const,
        name: c.name || c.email!.split('@')[0],
        posLabel: c.position || '',
        roleLabel: c.groupName || '',
        email: c.email!,
        departmentLabel: '',
        subtitle: [c.company, c.department, c.email].filter(Boolean).join(' · '),
        searchText: [c.name, c.email, c.company, c.department, c.position, c.groupName]
          .filter(Boolean)
          .join(' ')
          .toLowerCase(),
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
      base = base.filter((item) => item.searchText.includes(q));
    }
    return base;
  }, [companyUsers, contacts, filterTab, searchInput, selectedDeptId, deptDescendantsMap]);

  const groupedCompanySections = useMemo(() => {
    if (filterTab !== 'company') return [{ label: '', items: combinedItems }];
    const map = new Map<string, typeof combinedItems>();
    for (const item of combinedItems) {
      const key = item.departmentLabel || '소속 미지정';
      const arr = map.get(key) || [];
      arr.push(item);
      map.set(key, arr);
    }
    return Array.from(map.entries()).map(([label, items]) => ({ label, items }));
  }, [combinedItems, filterTab]);

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

        {filterTab === 'company' && departmentFilterOptions.length > 1 && (
          <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto pt-0.5">
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
      </div>

      {/* 연락처 리스트 */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="py-12 px-4 text-center text-xs text-slate-400">주소록을 불러오는 중...</div>
        ) : combinedItems.length === 0 ? (
          <div className="py-12 px-4 text-center text-xs text-slate-400">일치하는 연락처가 없습니다.</div>
        ) : (
          groupedCompanySections.map((section) => (
            <div key={section.label || 'default'}>
              {section.label && (
                <div className="sticky top-0 z-10 flex items-center justify-between bg-slate-50/95 backdrop-blur-sm px-4 py-1.5 border-y border-slate-100 text-[11px] font-semibold text-slate-500">
                  <span className="inline-flex items-center gap-1.5 truncate">
                    <Building2 className="h-3 w-3 text-[#007AFF] shrink-0" />
                    <span className="truncate">{section.label}</span>
                  </span>
                  <span className="tabular-nums text-slate-400 shrink-0">{section.items.length}명</span>
                </div>
              )}
              <div className="px-4 divide-y divide-slate-100">
                {section.items.map((item) => {
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
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">{item.name}</p>
                          {item.posLabel && (
                            <span className="truncate text-[11px] font-medium text-slate-500 shrink-0">
                              {item.posLabel}
                            </span>
                          )}
                          {item.source === 'company' && (
                            <span className="rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-[#007AFF] shrink-0">
                              {item.roleLabel}
                            </span>
                          )}
                        </div>
                        <p className="truncate text-xs text-slate-500">{item.subtitle}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))
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
