'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Search,
  X,
  Star,
  Users,
  Building2,
  User,
  RefreshCw,
  Loader2,
  Check,
  BookUser,
  Filter,
  Tag,
} from 'lucide-react';
import { contactsApi, orgApi, DepartmentTreeNodeDto } from '@/lib/api';
import { ContactDto, ContactGroupDto, UserDto } from '@lemail/shared-types';
import { SelectDropdown } from '@/components/common';
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
  onToggleRecipient: (target: RecipientTarget, entry: RecipientEntry) => void;
  onAddRecipientsBulk: (target: RecipientTarget, entries: RecipientEntry[]) => void;
  onClose?: () => void;
  className?: string;
}

const PAGE_LIMIT = 50;

export const ComposeAddressBookPanel: React.FC<ComposeAddressBookPanelProps> = ({
  to,
  cc,
  bcc,
  onToggleRecipient,
  onAddRecipientsBulk,
  onClose,
  className = '',
}) => {
  const [activeTab, setActiveTab] = useState<'personal' | 'company'>('company');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('all');
  const [selectedDeptId, setSelectedDeptId] = useState<string>('all');
  const [departmentTree, setDepartmentTree] = useState<DepartmentTreeNodeDto[]>([]);

  // 개인 주소록 상태
  const [groups, setGroups] = useState<ContactGroupDto[]>([]);
  const [contacts, setContacts] = useState<ContactDto[]>([]);
  const [contactsTotal, setContactsTotal] = useState(0);
  const [contactsPage, setContactsPage] = useState(1);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const groupFilterOptions = useMemo(() => {
    const baseOptions: Array<{
      value: string;
      label: string;
      icon: React.ReactNode;
    }> = [
      {
        value: 'all',
        label: '전체 연락처',
        icon: <Filter className="w-3.5 h-3.5 text-slate-500" />,
      },
      {
        value: 'starred',
        label: '중요 연락처',
        icon: <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />,
      },
      ...groups.map((g) => ({
        value: g.id,
        label: `${g.name} (${g.contactCount ?? 0})`,
        icon: <Tag className="w-3.5 h-3.5 text-sky-500" />,
      })),
      {
        value: 'ungrouped',
        label: '미분류',
        icon: <User className="w-3.5 h-3.5 text-slate-400" />,
      },
    ];
    return baseOptions;
  }, [groups]);

  // 사내 임직원 상태
  const [companyUsers, setCompanyUsers] = useState<UserDto[]>([]);
  const [companyLoaded, setCompanyLoaded] = useState(false);
  const [loadingCompany, setLoadingCompany] = useState(false);

  // 다중 선택 상태 (체크된 항목 key: "personal:<id>" 또는 "company:<id>")
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 현재 수신/참조/숨은참조 이메일 Set (소문자)
  const toEmailSet = useMemo(
    () => new Set(to.map((e) => extractPureEmail(e).toLowerCase())),
    [to],
  );
  const ccEmailSet = useMemo(
    () => new Set(cc.map((e) => extractPureEmail(e).toLowerCase())),
    [cc],
  );
  const bccEmailSet = useMemo(
    () => new Set(bcc.map((e) => extractPureEmail(e).toLowerCase())),
    [bcc],
  );

  // 검색어 디바운스
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // 그룹 목록 로드
  const loadGroups = useCallback(async () => {
    try {
      const data = await contactsApi.getGroups();
      setGroups(data || []);
    } catch {
      // 그룹 로드 실패 시 목록만 표시
    }
  }, []);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  // 개인 주소록 로드
  const loadPersonalContacts = useCallback(
    async (pageToLoad: number, append: boolean) => {
      try {
        setErrorMsg(null);
        if (append) {
          setLoadingMore(true);
        } else {
          setLoadingContacts(true);
        }

        const res = await contactsApi.getContacts({
          search: debouncedSearch || undefined,
          groupId: selectedGroupId,
          page: pageToLoad,
          limit: PAGE_LIMIT,
        });

        const nextItems = res.items || [];
        setContacts((prev) => (append ? [...prev, ...nextItems] : nextItems));
        setContactsTotal(res.total || 0);
        setContactsPage(pageToLoad);
      } catch (err: any) {
        setErrorMsg(err?.message || '주소록을 불러오지 못했습니다.');
      } finally {
        setLoadingContacts(false);
        setLoadingMore(false);
      }
    },
    [debouncedSearch, selectedGroupId],
  );

  useEffect(() => {
    if (activeTab === 'personal') {
      loadPersonalContacts(1, false);
    }
  }, [activeTab, loadPersonalContacts]);

  // 사내 임직원 및 부서 트리 로드
  const loadCompanyUsers = useCallback(async () => {
    try {
      setErrorMsg(null);
      setLoadingCompany(true);
      const [res, treeRes] = await Promise.all([
        contactsApi.getCompanyUsers(),
        orgApi.getDepartmentTree().catch(() => []),
      ]);
      const list = Array.isArray(res) ? res : (res as any)?.items || [];
      setCompanyUsers(list);
      setDepartmentTree(Array.isArray(treeRes) ? treeRes : []);
      setCompanyLoaded(true);
    } catch (err: any) {
      setErrorMsg(err?.message || '사내 임직원 목록을 불러오지 못했습니다.');
    } finally {
      setLoadingCompany(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'company' && !companyLoaded) {
      loadCompanyUsers();
    }
  }, [activeTab, companyLoaded, loadCompanyUsers]);

  // 탭 전환 시 선택 초기화
  const handleTabChange = (tab: 'personal' | 'company') => {
    setActiveTab(tab);
    setSelectedKeys([]);
  };

  const handleRefresh = () => {
    setSelectedKeys([]);
    if (activeTab === 'personal') {
      loadGroups();
      loadPersonalContacts(1, false);
    } else {
      loadCompanyUsers();
    }
  };

  // 부서 트리 평탄화 및 하위 부서 ID 맵 생성
  const { departmentFilterOptions, deptDescendantsMap } = useMemo(() => {
    const options: Array<{
      value: string;
      label: string;
      icon?: React.ReactNode;
      indent?: number;
      treePrefix?: string;
    }> = [
      {
        value: 'all',
        label: '전체 부서',
        icon: <Building2 className="h-3.5 w-3.5 text-sky-600" />,
      },
    ];
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
      nodes.forEach((node, idx) => {
        const isLast = idx === nodes.length - 1;
        options.push({
          value: node.id,
          label: node.name,
          indent: depth > 0 ? depth - 1 : 0,
          treePrefix: depth > 0 ? (isLast ? '└' : '├') : undefined,
        });
        if (node.children?.length) {
          walk(node.children, depth + 1);
        }
      });
    };

    for (const root of departmentTree) {
      collectDescendants(root);
    }
    walk(departmentTree);

    if (companyUsers.some((u) => !u.departmentId)) {
      options.push({ value: 'unassigned', label: '소속 미지정' });
    }

    return { departmentFilterOptions: options, deptDescendantsMap: descMap };
  }, [departmentTree, companyUsers]);

  // 사내 임직원 클라이언트 필터링
  const filteredCompanyUsers = useMemo(() => {
    const q = searchInput.trim().toLowerCase();
    return companyUsers.filter((u) => {
      if (selectedDeptId === 'unassigned') {
        if (u.departmentId) return false;
      } else if (selectedDeptId !== 'all') {
        const allowedIds = deptDescendantsMap.get(selectedDeptId);
        if (allowedIds) {
          if (!u.departmentId || !allowedIds.has(u.departmentId)) return false;
        } else if (u.departmentId !== selectedDeptId) {
          return false;
        }
      }

      if (!q) return true;
      return (
        u.name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.employeeId?.toLowerCase().includes(q) ||
        u.departmentName?.toLowerCase().includes(q) ||
        u.position?.toLowerCase().includes(q) ||
        u.jobTitle?.toLowerCase().includes(q)
      );
    });
  }, [companyUsers, selectedDeptId, deptDescendantsMap, searchInput]);

  // 표시용 통합 아이템 리스트
  const visibleItems = useMemo(() => {
    if (activeTab === 'personal') {
      return contacts.map((c) => ({
        key: `personal:${c.id}`,
        name: c.name,
        email: c.email || '',
        departmentLabel: '',
        subText: [c.company, c.department, c.position].filter(Boolean).join(' · ') || c.groupName || '',
        isStarred: c.isStarred,
      }));
    }
    return filteredCompanyUsers.map((u) => ({
      key: `company:${u.id}`,
      name: u.name,
      email: u.email || '',
      departmentLabel: u.departmentName || '소속 미지정',
      subText:
        [
          u.departmentName || '소속 미지정',
          [u.position, u.jobTitle].filter(Boolean).join('/'),
          u.employeeId ? `사번 ${u.employeeId}` : null,
        ]
          .filter(Boolean)
          .join(' · '),
      isStarred: false,
    }));
  }, [activeTab, contacts, filteredCompanyUsers]);

  const toggleSelectKey = (key: string) => {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const handleBulkAdd = (target: RecipientTarget) => {
    const entries: RecipientEntry[] = visibleItems
      .filter((item) => selectedKeys.includes(item.key) && Boolean(item.email))
      .map((item) => ({ name: item.name, email: item.email }));

    if (entries.length > 0) {
      onAddRecipientsBulk(target, entries);
      setSelectedKeys([]);
    }
  };

  const isLoading = activeTab === 'personal' ? loadingContacts : loadingCompany;

  return (
    <div
      className={`flex flex-col rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden ${className}`}
    >
      {/* 상단 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50/70">
        <div className="flex items-center gap-2">
          <BookUser className="h-4 w-4 text-sky-600" />
          <h2 className="text-sm font-bold text-slate-900">주소록</h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isLoading}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 disabled:opacity-50 transition"
            title="새로고침"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 transition"
              title="주소록 닫기"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* 탭 전환 */}
      <div className="grid grid-cols-2 border-b border-slate-200 bg-slate-50/40 p-1 gap-1">
        <button
          type="button"
          onClick={() => handleTabChange('personal')}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition ${
            activeTab === 'personal'
              ? 'bg-white text-sky-700 shadow-xs border border-slate-200/80'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users className="h-3.5 w-3.5" />
          <span>개인 주소록</span>
        </button>
        <button
          type="button"
          onClick={() => handleTabChange('company')}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition ${
            activeTab === 'company'
              ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/80'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Building2 className="h-3.5 w-3.5" />
          <span>사내 임직원</span>
        </button>
      </div>

      {/* 검색 및 그룹 필터 */}
      <div className="p-3 space-y-2 border-b border-slate-100 bg-white">
        <div className="relative">
          <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={
              activeTab === 'personal' ? '이름, 이메일, 부서 검색...' : '임직원 이름, 이메일 검색...'
            }
            className="w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-8 pr-8 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500 transition"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              title="검색어 지우기"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {activeTab === 'personal' ? (
          <SelectDropdown
            options={groupFilterOptions}
            value={selectedGroupId}
            onChange={(val) => {
              setSelectedGroupId(val);
              setSelectedKeys([]);
            }}
            headerLabel="주소록 그룹 필터"
            size="sm"
            fullWidth
            title="주소록 필터 선택"
          />
        ) : (
          <SelectDropdown
            options={departmentFilterOptions}
            value={selectedDeptId}
            onChange={(val) => {
              setSelectedDeptId(val);
              setSelectedKeys([]);
            }}
            headerLabel="부서 필터"
            size="sm"
            fullWidth
            title="부서 필터 선택"
          />
        )}
      </div>

      {/* 안내 문구 */}
      <div className="px-3 py-1.5 bg-slate-50/60 border-b border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
        <span>
          {activeTab === 'personal'
            ? `총 ${contactsTotal}명`
            : `총 ${filteredCompanyUsers.length}명`}
        </span>
        <span>버튼 클릭 시 즉시 추가/해제</span>
      </div>

      {/* 목록 영역 */}
      <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100">
        {errorMsg ? (
          <div className="p-6 text-center text-xs text-rose-600 space-y-2">
            <p>{errorMsg}</p>
            <button
              type="button"
              onClick={handleRefresh}
              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1 font-semibold text-rose-700 hover:bg-rose-100"
            >
              다시 시도
            </button>
          </div>
        ) : isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 text-xs text-slate-400 gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-sky-600" />
            <span>연락처를 불러오는 중...</span>
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center text-xs text-slate-400 gap-2">
            <User className="h-7 w-7 text-slate-300" />
            <p>표시할 연락처가 없습니다.</p>
          </div>
        ) : activeTab === 'company' ? (
          <>
            {(() => {
              const deptGroups = new Map<string, typeof visibleItems>();
              for (const item of visibleItems) {
                const key = item.departmentLabel || '소속 미지정';
                const list = deptGroups.get(key) || [];
                list.push(item);
                deptGroups.set(key, list);
              }
              return Array.from(deptGroups.entries()).map(([deptLabel, deptItems]) => (
                <div key={deptLabel}>
                  <div className="sticky top-0 z-10 px-3 py-1.5 bg-slate-50/95 backdrop-blur-sm border-b border-slate-100 flex items-center justify-between text-[11px] font-semibold text-slate-600">
                    <span className="inline-flex items-center gap-1.5 truncate">
                      <Building2 className="h-3 w-3 text-sky-600 shrink-0" />
                      <span className="truncate">{deptLabel}</span>
                    </span>
                    <span className="tabular-nums text-slate-400 shrink-0">{deptItems.length}명</span>
                  </div>
                  {deptItems.map((item) => {
                    const hasEmail = Boolean(item.email);
                    const pureLower = item.email.toLowerCase();
                    const isInTo = hasEmail && toEmailSet.has(pureLower);
                    const isInCc = hasEmail && ccEmailSet.has(pureLower);
                    const isInBcc = hasEmail && bccEmailSet.has(pureLower);
                    const isChecked = selectedKeys.includes(item.key);

                    return (
                      <div
                        key={item.key}
                        className={`px-3 py-2 flex items-center gap-2 border-b border-slate-100/80 hover:bg-slate-50/80 transition ${
                          isChecked ? 'bg-sky-50/60' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          disabled={!hasEmail}
                          checked={isChecked}
                          onChange={() => toggleSelectKey(item.key)}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500 disabled:opacity-40 cursor-pointer shrink-0"
                        />

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="text-xs font-semibold text-slate-900 truncate">
                              {item.name || '-'}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {item.email || <span className="text-slate-300">이메일 없음</span>}
                          </div>
                          {item.subText && (
                            <div className="text-[10px] text-slate-400 truncate">
                              {item.subText}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            disabled={!hasEmail}
                            onClick={() =>
                              onToggleRecipient('to', { name: item.name, email: item.email })
                            }
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border transition disabled:opacity-40 ${
                              isInTo
                                ? 'bg-sky-600 text-white border-sky-600'
                                : 'bg-white text-sky-700 border-sky-200 hover:bg-sky-50'
                            }`}
                            title="받는사람에 추가/해제"
                          >
                            수신
                          </button>
                          <button
                            type="button"
                            disabled={!hasEmail}
                            onClick={() =>
                              onToggleRecipient('cc', { name: item.name, email: item.email })
                            }
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border transition disabled:opacity-40 ${
                              isInCc
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50'
                            }`}
                            title="참조에 추가/해제"
                          >
                            참조
                          </button>
                          <button
                            type="button"
                            disabled={!hasEmail}
                            onClick={() =>
                              onToggleRecipient('bcc', { name: item.name, email: item.email })
                            }
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border transition disabled:opacity-40 ${
                              isInBcc
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50'
                            }`}
                            title="숨은참조에 추가/해제"
                          >
                            숨은
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ));
            })()}
          </>
        ) : (
          <>
            {visibleItems.map((item) => {
              const hasEmail = Boolean(item.email);
              const pureLower = item.email.toLowerCase();
              const isInTo = hasEmail && toEmailSet.has(pureLower);
              const isInCc = hasEmail && ccEmailSet.has(pureLower);
              const isInBcc = hasEmail && bccEmailSet.has(pureLower);
              const isChecked = selectedKeys.includes(item.key);

              return (
                <div
                  key={item.key}
                  className={`px-3 py-2 flex items-center justify-between gap-2 transition hover:bg-slate-50/80 ${
                    isChecked ? 'bg-sky-50/50' : ''
                  }`}
                >
                  <div className="flex items-start gap-2 min-w-0 flex-1">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={!hasEmail}
                      onChange={() => toggleSelectKey(item.key)}
                      aria-label={`${item.name} 선택`}
                      className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500 disabled:opacity-40 cursor-pointer shrink-0"
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        {item.isStarred && (
                          <Star className="h-3 w-3 fill-amber-400 text-amber-400 shrink-0" />
                        )}
                        <span className="text-xs font-semibold text-slate-900 truncate">
                          {item.name}
                        </span>
                      </div>

                      {hasEmail ? (
                        <p className="text-[11px] font-mono text-slate-500 truncate">
                          {item.email}
                        </p>
                      ) : (
                        <p className="text-[11px] text-amber-600 font-medium">이메일 없음</p>
                      )}

                      {item.subText && (
                        <p className="text-[10px] text-slate-400 truncate mt-0.5">{item.subText}</p>
                      )}
                    </div>
                  </div>

                  {/* 오른쪽 수신 / 참조 / 숨은참조 바로 추가 버튼 (사내 임직원 탭과 동일 스타일) */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={!hasEmail}
                      onClick={() =>
                        onToggleRecipient('to', { name: item.name, email: item.email })
                      }
                      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border transition disabled:opacity-40 disabled:cursor-not-allowed ${
                        isInTo
                          ? 'bg-sky-600 text-white border-sky-600'
                          : 'bg-white text-sky-700 border-sky-200 hover:bg-sky-50'
                      }`}
                      title={isInTo ? '받는사람에서 제거' : '받는사람(수신)에 추가'}
                    >
                      수신
                    </button>

                    <button
                      type="button"
                      disabled={!hasEmail}
                      onClick={() =>
                        onToggleRecipient('cc', { name: item.name, email: item.email })
                      }
                      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border transition disabled:opacity-40 disabled:cursor-not-allowed ${
                        isInCc
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50'
                      }`}
                      title={isInCc ? '참조에서 제거' : '참조(Cc)에 추가'}
                    >
                      참조
                    </button>

                    <button
                      type="button"
                      disabled={!hasEmail}
                      onClick={() =>
                        onToggleRecipient('bcc', { name: item.name, email: item.email })
                      }
                      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border transition disabled:opacity-40 disabled:cursor-not-allowed ${
                        isInBcc
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50'
                      }`}
                      title={isInBcc ? '숨은참조에서 제거' : '숨은참조(Bcc)에 추가'}
                    >
                      숨은
                    </button>
                  </div>
                </div>
              );
            })}

            {activeTab === 'personal' && contacts.length < contactsTotal && (
              <div className="p-3 text-center">
                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={() => loadPersonalContacts(contactsPage + 1, true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition"
                >
                  {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>더 보기 ({contacts.length} / {contactsTotal})</span>
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* 다중 선택 일괄 추가 바 */}
      {selectedKeys.length > 0 && (
        <div className="border-t border-slate-200 bg-sky-50/70 p-3 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-bold text-sky-900">{selectedKeys.length}명 선택됨</span>
            <button
              type="button"
              onClick={() => setSelectedKeys([])}
              className="text-slate-500 hover:text-slate-800 font-medium"
            >
              선택 해제
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={() => handleBulkAdd('to')}
              className="rounded-lg bg-sky-600 py-1.5 text-[11px] font-semibold text-white hover:bg-sky-500 transition"
            >
              수신 추가
            </button>
            <button
              type="button"
              onClick={() => handleBulkAdd('cc')}
              className="rounded-lg bg-indigo-600 py-1.5 text-[11px] font-semibold text-white hover:bg-indigo-500 transition"
            >
              참조 추가
            </button>
            <button
              type="button"
              onClick={() => handleBulkAdd('bcc')}
              className="rounded-lg bg-emerald-600 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-500 transition"
            >
              숨은참조
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
