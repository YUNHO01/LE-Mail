'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Users,
  UserPlus,
  Upload,
  Download,
  Trash2,
  Search,
  Star,
  Mail,
  Edit,
  Building2,
  Tag,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Filter,
  Check,
  User,
  Phone,
  FileSpreadsheet,
} from 'lucide-react';
import { contactsApi, fetchApi } from '@/lib/api';
import { ContactDto, ContactGroupDto, UserDto } from '@lemail/shared-types';
import { PageHeader, SearchInput, TableUtilityButtons, SelectDropdown } from '@/components/common';
import { exportTableToExcel } from '@/lib/excel';
import { ContactModal } from '@/components/contacts/ContactModal';
import { ContactImportModal } from '@/components/contacts/ContactImportModal';
import { ContactGroupModal } from '@/components/contacts/ContactGroupModal';

export default function ContactsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentGroupId = searchParams.get('groupId') || 'all';

  const [contacts, setContacts] = useState<ContactDto[]>([]);
  const [companyUsers, setCompanyUsers] = useState<UserDto[]>([]);
  const [groups, setGroups] = useState<ContactGroupDto[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectMode, setSelectMode] = useState(false);
  const [activeDetailId, setActiveDetailId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // 필터 상태
  const [statusFilter, setStatusFilter] = useState<'all' | 'starred' | 'has_email' | 'has_phone'>('all');

  // 선택된 체크박스 목록
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // 모달 상태들
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<ContactDto | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // 드롭다운 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 그룹 목록 로드
  const loadGroups = useCallback(async () => {
    try {
      const data = await contactsApi.getGroups();
      setGroups(data || []);
    } catch (err) {
      console.error('그룹 목록 로드 실패:', err);
    }
  }, []);

  // 주소록 데이터 로드
  const loadContacts = useCallback(async () => {
    try {
      setLoading(true);
      setSelectedIds([]);

      if (currentGroupId === 'company') {
        const res = await contactsApi.getCompanyUsers();
        const usersList = Array.isArray(res) ? res : (res as any)?.items || [];
        setCompanyUsers(usersList);
        setTotal(usersList.length);
      } else {
        const res = await contactsApi.getContacts({
          search: searchTerm,
          groupId: currentGroupId,
          page: 1,
          limit: 1000, // 클라이언트 필터링 및 페이징 일관성 유지
        });
        setContacts(res.items || []);
        setTotal(res.total || 0);
      }
    } catch (err) {
      console.error('연락처 로드 실패:', err);
    } finally {
      setLoading(false);
    }
  }, [currentGroupId, searchTerm]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    loadContacts();
    setPage(1);
  }, [loadContacts]);

  // 필터 옵션 정의
  const filterOptions = [
    { value: 'all', label: '전체', icon: <Filter className="w-3.5 h-3.5 text-slate-500" /> },
    { value: 'starred', label: '중요 연락처', icon: <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" /> },
    { value: 'has_email', label: '이메일 보유', icon: <Mail className="w-3.5 h-3.5 text-sky-500" /> },
    { value: 'has_phone', label: '전화번호 보유', icon: <Phone className="w-3.5 h-3.5 text-emerald-500" /> },
  ];

  // 필터링 적용된 목록
  const filteredContacts = useMemo(() => {
    return contacts.filter((c) => {
      if (statusFilter === 'starred') return c.isStarred;
      if (statusFilter === 'has_email') return Boolean(c.email);
      if (statusFilter === 'has_phone') return Boolean(c.phone);
      return true;
    });
  }, [contacts, statusFilter]);

  // 사내 임직원 검색 필터링
  const filteredCompanyUsers = useMemo(() => {
    if (!searchTerm) return companyUsers;
    const s = searchTerm.toLowerCase();
    return companyUsers.filter(
      (u) =>
        u.name.toLowerCase().includes(s) ||
        u.email.toLowerCase().includes(s) ||
        (u.employeeId && u.employeeId.toLowerCase().includes(s)) ||
        (u.departmentName && u.departmentName.toLowerCase().includes(s)) ||
        (u.position && u.position.toLowerCase().includes(s)),
    );
  }, [companyUsers, searchTerm]);

  const activeItemsCount =
    currentGroupId === 'company' ? filteredCompanyUsers.length : filteredContacts.length;
  const totalPages = Math.max(1, Math.ceil(activeItemsCount / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;

  const paginatedContacts = useMemo(() => {
    return filteredContacts.slice(startIndex, startIndex + pageSize);
  }, [filteredContacts, startIndex, pageSize]);

  const paginatedCompanyUsers = useMemo(() => {
    return filteredCompanyUsers.slice(startIndex, startIndex + pageSize);
  }, [filteredCompanyUsers, startIndex, pageSize]);

  const displayStart = activeItemsCount === 0 ? 0 : startIndex + 1;
  const displayEnd = Math.min(startIndex + pageSize, activeItemsCount);

  // 전체 선택 / 해제
  const currentPaginatedIds =
    currentGroupId === 'company'
      ? paginatedCompanyUsers.map((u) => u.id)
      : paginatedContacts.map((c) => c.id);

  const allCurrentSelected =
    currentPaginatedIds.length > 0 &&
    currentPaginatedIds.every((id) => selectedIds.includes(id));

  const handleSelectAll = () => {
    if (allCurrentSelected) {
      setSelectedIds((prev) => prev.filter((id) => !currentPaginatedIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...currentPaginatedIds])));
    }
  };

  const handleToggleSelect = (id: string, e?: React.SyntheticEvent) => {
    if (e) e.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  // 중요 토글
  const handleToggleStar = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await contactsApi.toggleStar(id);
      setContacts((prev) =>
        prev.map((c) => (c.id === id ? { ...c, isStarred: !c.isStarred } : c)),
      );
    } catch (err) {
      console.error('별표 토글 실패:', err);
    }
  };

  // 단일 삭제
  const handleDelete = async (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`'${name}' 연락처를 삭제하시겠습니까?`)) return;
    try {
      await contactsApi.deleteContact(id);
      loadContacts();
      loadGroups();
      window.dispatchEvent(new CustomEvent('contacts:refresh-groups'));
    } catch (err) {
      alert('삭제 중 오류가 발생했습니다.');
    }
  };

  // 선택 다중 삭제
  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`선택한 ${selectedIds.length}개의 연락처를 삭제하시겠습니까?`)) return;
    try {
      await contactsApi.bulkDeleteContacts(selectedIds);
      loadContacts();
      loadGroups();
      window.dispatchEvent(new CustomEvent('contacts:refresh-groups'));
    } catch (err) {
      alert('선택 삭제 중 오류가 발생했습니다.');
    }
  };

  // 내보내기 실행
  const handleExport = (format: 'xlsx' | 'csv' | 'vcf') => {
    setExportMenuOpen(false);
    const token = typeof window !== 'undefined' ? localStorage.getItem('lemail_token') : '';
    const url = `/api/contacts/export?format=${format}&groupId=${currentGroupId}`;

    fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('내보내기 파일 생성에 실패했습니다.');
        return res.blob();
      })
      .then((blob) => {
        const link = document.createElement('a');
        link.href = window.URL.createObjectURL(blob);
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        link.download = `contacts_${dateStr}.${format}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      })
      .catch((err) => {
        alert('내보내기 파일 다운로드 실패: ' + err.message);
      });
  };

  // 클립보드 복사 유틸
  const handleCopy = () => {
    const header = ['이름', '이메일', '전화번호', '회사명', '부서명', '직급', '그룹'];
    const rows =
      currentGroupId === 'company'
        ? filteredCompanyUsers.map((u) => [
            u.name || '',
            u.email || '',
            u.phone || u.mobile || '-',
            '사내',
            u.departmentName || (u.employeeId ? `사번: ${u.employeeId}` : '-'),
            u.position || u.jobTitle || '-',
            u.role === 'SYSTEM_ADMIN' ? '시스템 관리자' : '일반 사원',
          ])
        : filteredContacts.map((c) => [
            c.name || '',
            c.email || '',
            c.phone || c.companyPhone || '',
            c.company || '',
            c.department || '',
            c.position || '',
            c.groupName || '미분류',
          ]);
    const text = [header.join('\t'), ...rows.map((r) => r.join('\t'))].join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 목록용 엑셀 내보내기 유틸 (현재 페이지 목록 또는 선택된 항목)
  const handleExcelExport = () => {
    const isCompany = currentGroupId === 'company';
    const targetItems = isCompany
      ? selectedIds.length > 0
        ? filteredCompanyUsers.filter((u) => selectedIds.includes(u.id))
        : paginatedCompanyUsers
      : selectedIds.length > 0
        ? filteredContacts.filter((c) => selectedIds.includes(c.id))
        : paginatedContacts;

    if (targetItems.length === 0) {
      alert('내보낼 연락처 데이터가 없습니다.');
      return;
    }

    const headers = ['이름', '이메일', '전화번호', '회사명', '부서명', '직급', '그룹', '등록일시'];
    const rows = isCompany
      ? (targetItems as typeof filteredCompanyUsers).map((u) => [
          u.name || '',
          u.email || '',
          u.phone || u.mobile || '-',
          '사내',
          u.departmentName || (u.employeeId ? `사번: ${u.employeeId}` : '-'),
          u.position || u.jobTitle || '-',
          u.role === 'SYSTEM_ADMIN' ? '시스템 관리자' : '일반 사원',
          u.createdAt ? new Date(u.createdAt).toISOString().slice(0, 10) : '-',
        ])
      : (targetItems as typeof filteredContacts).map((c) => [
          c.name || '',
          c.email || '',
          c.phone || c.companyPhone || '',
          c.company || '',
          c.department || '',
          c.position || '',
          c.groupName || '미분류',
          c.createdAt ? new Date(c.createdAt).toISOString().slice(0, 10) : '-',
        ]);

    const today = new Date().toISOString().slice(0, 10);
    const categoryName = getCategoryTitle().replace(/\s+/g, '_');
    exportTableToExcel({
      filename: `LEMail_Contacts_${categoryName}_${today}.xlsx`,
      sheetName: categoryName.slice(0, 31),
      headers,
      rows,
    });
  };

  // 인쇄
  const handlePrint = () => {
    window.print();
  };

  // 메일 쓰기로 바로 이동
  const handleComposeMail = (email: string, e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/mail/compose?to=${encodeURIComponent(email)}`);
  };

  // 카테고리 제목
  const getCategoryTitle = () => {
    if (currentGroupId === 'all') return '전체 연락처';
    if (currentGroupId === 'starred') return '중요 연락처';
    if (currentGroupId === 'company') return '사내 임직원 주소록';
    if (currentGroupId === 'ungrouped') return '미분류 연락처';
    const found = groups.find((g) => g.id === currentGroupId);
    return found ? `${found.name} 그룹` : '주소록';
  };

  // 날짜 포맷
  const formatDateParts = (iso: string) => {
    if (!iso) return { dateStr: '-', timeStr: '-' };
    const d = new Date(iso);
    if (isNaN(d.getTime())) return { dateStr: '-', timeStr: '-' };
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`;
    const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(
      2,
      '0',
    )}:${String(d.getSeconds()).padStart(2, '0')}`;
    return { dateStr, timeStr };
  };

  const activeContact = useMemo(
    () => (currentGroupId !== 'company' ? contacts.find((c) => c.id === activeDetailId) || null : null),
    [contacts, activeDetailId, currentGroupId],
  );

  const activeCompanyUser = useMemo(
    () => (currentGroupId === 'company' ? companyUsers.find((u) => u.id === activeDetailId) || null : null),
    [companyUsers, activeDetailId, currentGroupId],
  );

  const toggleSelectMode = () => {
    setSelectMode((prev) => {
      const next = !prev;
      if (!next) setSelectedIds([]);
      return next;
    });
  };

  return (
    <div className="flex-1 flex min-h-0 bg-white overflow-hidden">
      {/* PANE 2: iCloud Contacts List Column */}
      <section className="w-full lg:w-[360px] xl:w-[395px] shrink-0 border-r border-black/[0.08] flex flex-col min-h-0 bg-white">
        {/* Sticky Header */}
        <div className="px-4 pt-4 pb-2.5 border-b border-black/[0.06] space-y-2.5 bg-white/95 backdrop-blur-md">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h1 className="text-[19px] font-bold tracking-tight text-[#1d1d1f] truncate">
                {getCategoryTitle()}
              </h1>
              <p className="text-[11px] text-[#86868b] mt-0.5 tabular-nums">
                전체 {activeItemsCount}명
              </p>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {currentGroupId !== 'company' && (
                <>
                  <button
                    type="button"
                    onClick={toggleSelectMode}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                      selectMode || selectedIds.length > 0
                        ? 'bg-[#0071e3] text-white'
                        : 'text-[#0071e3] hover:bg-[#007aff]/10'
                    }`}
                  >
                    {selectMode ? '완료' : '선택'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedContact(null);
                      setContactModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0071e3] hover:bg-[#0077ed] text-white text-xs font-medium shadow-xs transition"
                    title="새 연락처"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    <span>추가</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Search + Filter */}
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <SearchInput
                value={searchTerm}
                onChange={setSearchTerm}
                placeholder="이름, 이메일, 전화번호 검색..."
                size="sm"
              />
            </div>
            {currentGroupId !== 'company' && (
              <div className="shrink-0">
                <SelectDropdown
                  options={filterOptions}
                  value={statusFilter}
                  onChange={(val) => {
                    setStatusFilter(val as any);
                    setPage(1);
                  }}
                  headerLabel="연락처 필터"
                  size="sm"
                  menuWidthClass="w-36"
                />
              </div>
            )}
          </div>

          {/* Compact Manage Actions (그룹 관리 / 가져오기 / 내보내기) */}
          {currentGroupId !== 'company' && (
            <div className="flex items-center justify-between gap-1 pt-0.5 text-[11px]">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setGroupModalOpen(true)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[#6e6e73] hover:bg-black/[0.05] hover:text-[#1d1d1f] transition"
                >
                  <Tag className="h-3 w-3" />
                  <span>그룹</span>
                </button>
                <button
                  type="button"
                  onClick={() => setImportModalOpen(true)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[#6e6e73] hover:bg-black/[0.05] hover:text-[#1d1d1f] transition"
                >
                  <Upload className="h-3 w-3" />
                  <span>가져오기</span>
                </button>
                <div className="relative" ref={exportMenuRef}>
                  <button
                    type="button"
                    onClick={() => setExportMenuOpen(!exportMenuOpen)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[#6e6e73] hover:bg-black/[0.05] hover:text-[#1d1d1f] transition"
                  >
                    <Download className="h-3 w-3" />
                    <span>내보내기</span>
                    <ChevronDown className="h-3 w-3" />
                  </button>
                  {exportMenuOpen && (
                    <div className="absolute left-0 mt-1 w-52 rounded-xl bg-white border border-black/[0.08] shadow-xl py-1 z-30 text-xs">
                      <button
                        type="button"
                        onClick={() => handleExport('xlsx')}
                        className="w-full text-left px-3.5 py-2 text-[#1d1d1f] hover:bg-black/[0.04] transition"
                      >
                        <div className="font-medium flex items-center gap-1.5">
                          <FileSpreadsheet className="h-3.5 w-3.5 text-[#34c759]" />
                          <span>Excel 통합문서 (.xlsx)</span>
                        </div>
                        <div className="text-[10px] text-[#86868b]">15개 표준 항목 전체 포함</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExport('csv')}
                        className="w-full text-left px-3.5 py-2 text-[#1d1d1f] hover:bg-black/[0.04] transition border-t border-black/[0.05]"
                      >
                        <div className="font-medium">Outlook 호환 CSV (.csv)</div>
                        <div className="text-[10px] text-[#86868b]">Windows/Outlook 호환</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExport('vcf')}
                        className="w-full text-left px-3.5 py-2 text-[#1d1d1f] hover:bg-black/[0.04] transition border-t border-black/[0.05]"
                      >
                        <div className="font-medium">vCard 포맷 (.vcf)</div>
                        <div className="text-[10px] text-[#86868b]">Apple / 스마트폰 표준</div>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {(selectMode || selectedIds.length > 0) && (
                <label className="inline-flex items-center gap-1 text-[#6e6e73] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allCurrentSelected}
                    onChange={handleSelectAll}
                    className="h-3.5 w-3.5 rounded accent-[#0071e3] cursor-pointer"
                  />
                  <span>전체</span>
                </label>
              )}
            </div>
          )}

          {/* Bulk Action Bar */}
          {selectedIds.length > 0 && currentGroupId !== 'company' && (
            <div className="pt-2 border-t border-black/[0.06] flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[#0071e3]">
                {selectedIds.length}명 선택됨
              </span>
              <button
                type="button"
                onClick={handleBulkDelete}
                className="px-2.5 py-1 rounded-md bg-[#ff3b30]/10 hover:bg-[#ff3b30]/20 text-[#ff3b30] text-[11px] font-medium inline-flex items-center gap-1 transition"
              >
                <Trash2 className="w-3 h-3" />
                <span>삭제</span>
              </button>
            </div>
          )}
        </div>

        {/* Scrollable Contact Card List */}
        <div className="flex-1 overflow-y-auto py-1.5 divide-y divide-black/[0.04]">
          {loading ? (
            <div className="py-20 text-center text-[#86868b]">
              <RefreshCw className="h-5 w-5 animate-spin text-[#0071e3] mx-auto mb-2" />
              <span className="text-xs font-medium">주소록을 불러오는 중...</span>
            </div>
          ) : currentGroupId === 'company' ? (
            paginatedCompanyUsers.length === 0 ? (
              <div className="py-20 text-center text-[#86868b]">
                <Users className="h-10 w-10 text-[#d2d2d7] mx-auto mb-2 stroke-[1.5]" />
                <p className="font-medium text-[#1d1d1f] text-sm">등록된 사내 임직원이 없습니다.</p>
              </div>
            ) : (
              paginatedCompanyUsers.map((u) => {
                const isActive = activeDetailId === u.id;
                return (
                  <div
                    key={u.id}
                    onClick={() => setActiveDetailId(u.id)}
                    className={`group mx-2 my-0.5 px-3 py-2.5 rounded-xl cursor-pointer transition flex items-center gap-3 ${
                      isActive ? 'bg-[#007aff]/12' : 'hover:bg-black/[0.03]'
                    }`}
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold bg-indigo-500/12 text-indigo-600">
                      {u.name ? u.name.slice(0, 1).toUpperCase() : 'U'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13.5px] font-semibold text-[#1d1d1f] truncate">
                          {u.name}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 font-medium shrink-0">
                          {u.role === 'SYSTEM_ADMIN' ? '관리자' : '임직원'}
                        </span>
                      </div>
                      <div className="text-[12px] text-[#86868b] truncate mt-0.5">{u.email}</div>
                    </div>
                  </div>
                );
              })
            )
          ) : paginatedContacts.length === 0 ? (
            <div className="py-20 px-6 text-center text-[#86868b]">
              <Users className="h-10 w-10 text-[#d2d2d7] mx-auto mb-2 stroke-[1.5]" />
              <p className="font-medium text-[#1d1d1f] text-sm">등록된 연락처가 없습니다.</p>
              <p className="text-xs text-[#86868b] mt-1">
                [추가] 버튼을 눌러 새 연락처를 등록해 보세요.
              </p>
            </div>
          ) : (
            paginatedContacts.map((c) => {
              const isChecked = selectedIds.includes(c.id);
              const isActive = activeDetailId === c.id;
              return (
                <div
                  key={c.id}
                  onClick={() => {
                    if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
                      setActiveDetailId(c.id);
                    } else {
                      setSelectedContact(c);
                      setContactModalOpen(true);
                    }
                  }}
                  className={`group mx-2 my-0.5 px-3 py-2.5 rounded-xl cursor-pointer transition flex items-center gap-2.5 ${
                    isActive
                      ? 'bg-[#007aff]/12'
                      : isChecked
                      ? 'bg-[#007aff]/5'
                      : 'hover:bg-black/[0.03]'
                  }`}
                >
                  {(selectMode || selectedIds.length > 0) && (
                    <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => handleToggleSelect(c.id, e)}
                        className="h-3.5 w-3.5 rounded accent-[#0071e3] cursor-pointer"
                      />
                    </div>
                  )}

                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold bg-[#0071e3]/12 text-[#0071e3]">
                    {c.name ? c.name.slice(0, 1).toUpperCase() : <User className="h-4 w-4" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[13.5px] font-semibold text-[#1d1d1f] truncate">
                          {c.name || '-'}
                        </span>
                        {c.company && (
                          <span className="text-[11px] text-[#86868b] truncate">· {c.company}</span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => handleToggleStar(c.id, e)}
                        className={`p-0.5 rounded transition shrink-0 ${
                          c.isStarred
                            ? 'text-[#ff9500]'
                            : 'text-[#d2d2d7] opacity-0 group-hover:opacity-100 hover:text-[#ff9500]'
                        }`}
                        title={c.isStarred ? '중요 해제' : '중요 표시'}
                      >
                        <Star className={`h-3.5 w-3.5 ${c.isStarred ? 'fill-[#ff9500]' : ''}`} />
                      </button>
                    </div>
                    <div className="text-[12px] text-[#86868b] truncate mt-0.5">
                      {c.email || c.phone || '연락처 정보 없음'}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Compact Pagination Footer */}
        <div className="px-4 py-2.5 border-t border-black/[0.06] bg-white flex items-center justify-between text-[11px] text-[#86868b]">
          <span className="tabular-nums">
            {displayStart}-{displayEnd} / {activeItemsCount}명
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-1 rounded-md hover:bg-black/[0.05] disabled:opacity-30 transition"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="px-1.5 font-medium text-[#1d1d1f] tabular-nums">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="p-1 rounded-md hover:bg-black/[0.05] disabled:opacity-30 transition"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </section>

      {/* PANE 3: Contact Detail Pane (Desktop lg+) */}
      <div className="hidden lg:flex flex-1 min-w-0 min-h-0 flex-col bg-white">
        {activeContact ? (
          <>
            {/* Top Toolbar */}
            <div className="h-12 shrink-0 px-6 border-b border-black/[0.06] flex items-center justify-between bg-white/95 backdrop-blur-md">
              <div className="flex items-center gap-1.5">
                {activeContact.email && (
                  <button
                    type="button"
                    onClick={(e) => handleComposeMail(activeContact.email!, e)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#0071e3] hover:bg-[#0077ed] px-3 py-1.5 text-xs font-medium text-white shadow-xs transition"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    <span>메일 쓰기</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => handleToggleStar(activeContact.id, e)}
                  className="p-1.5 rounded-lg text-[#6e6e73] hover:bg-black/[0.05] transition"
                  title={activeContact.isStarred ? '중요 해제' : '중요 표시'}
                >
                  <Star
                    className={`h-4 w-4 ${
                      activeContact.isStarred ? 'fill-[#ff9500] text-[#ff9500]' : ''
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedContact(activeContact);
                    setContactModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#1d1d1f] hover:bg-black/[0.05] transition"
                >
                  <Edit className="h-3.5 w-3.5 text-[#0071e3]" />
                  <span>편집</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => handleDelete(activeContact.id, activeContact.name, e)}
                  className="p-1.5 rounded-lg text-[#6e6e73] hover:bg-[#ff3b30]/10 hover:text-[#ff3b30] transition"
                  title="삭제"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Profile Body */}
            <div className="flex-1 overflow-y-auto px-8 py-8">
              <div className="max-w-4xl space-y-6">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-[#0071e3]/12 text-[#0071e3] text-xl font-bold flex items-center justify-center shrink-0">
                    {activeContact.name ? activeContact.name.slice(0, 1).toUpperCase() : 'C'}
                  </div>
                  <div>
                    <h2 className="text-[22px] font-bold tracking-tight text-[#1d1d1f]">
                      {activeContact.name || '-'}
                    </h2>
                    {(activeContact.company || activeContact.department || activeContact.position) && (
                      <p className="text-[13px] text-[#6e6e73] mt-0.5">
                        {[activeContact.company, activeContact.department, activeContact.position]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    )}
                    {activeContact.groupName && (
                      <span className="inline-flex items-center gap-1.5 mt-2 rounded-full bg-[#f5f5f7] px-2.5 py-0.5 text-[11px] font-medium text-[#1d1d1f]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#0071e3]" />
                        {activeContact.groupName}
                      </span>
                    )}
                  </div>
                </div>

                {/* 2-Column Structured Info Cards */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {/* Card 1: 연락처 정보 */}
                  <div className="rounded-2xl bg-[#f5f5f7] border border-black/[0.06] overflow-hidden">
                    <div className="px-5 py-2.5 border-b border-black/[0.06] text-[11px] font-semibold text-[#86868b]">
                      연락처 정보
                    </div>
                    <div className="divide-y divide-black/[0.06] text-[13px]">
                      <div className="px-5 py-3 flex items-center justify-between gap-4">
                        <span className="text-[#86868b] w-24 shrink-0">이메일</span>
                        {activeContact.email ? (
                          <button
                            type="button"
                            onClick={(e) => handleComposeMail(activeContact.email!, e)}
                            className="text-[#0071e3] hover:underline font-medium text-right break-all"
                          >
                            {activeContact.email}
                          </button>
                        ) : (
                          <span className="text-[#86868b]">-</span>
                        )}
                      </div>
                      <div className="px-5 py-3 flex items-center justify-between gap-4">
                        <span className="text-[#86868b] w-24 shrink-0">휴대전화</span>
                        <span className="text-[#1d1d1f] tabular-nums text-right">
                          {activeContact.phone
                            ? `${activeContact.mobileCountryCode && activeContact.mobileCountryCode !== '+82' ? `${activeContact.mobileCountryCode} ` : ''}${activeContact.phone}`
                            : '-'}
                        </span>
                      </div>
                      <div className="px-5 py-3 flex items-center justify-between gap-4">
                        <span className="text-[#86868b] w-24 shrink-0">회사전화</span>
                        <span className="text-[#1d1d1f] tabular-nums text-right">
                          {activeContact.companyPhone || '-'}
                        </span>
                      </div>
                      <div className="px-5 py-3 flex items-center justify-between gap-4">
                        <span className="text-[#86868b] w-24 shrink-0">팩스</span>
                        <span className="text-[#1d1d1f] tabular-nums text-right">
                          {activeContact.companyFax || '-'}
                        </span>
                      </div>
                      <div className="px-5 py-3 flex items-center justify-between gap-4">
                        <span className="text-[#86868b] w-24 shrink-0">웹사이트</span>
                        {activeContact.websiteUrl ? (
                          <a
                            href={activeContact.websiteUrl.startsWith('http') ? activeContact.websiteUrl : `https://${activeContact.websiteUrl}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[#0071e3] hover:underline text-right break-all"
                          >
                            {activeContact.websiteUrl}
                          </a>
                        ) : (
                          <span className="text-[#86868b]">-</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card 2: 소속 및 기념일 */}
                  <div className="rounded-2xl bg-[#f5f5f7] border border-black/[0.06] overflow-hidden">
                    <div className="px-5 py-2.5 border-b border-black/[0.06] text-[11px] font-semibold text-[#86868b]">
                      소속 및 기타 정보
                    </div>
                    <div className="divide-y divide-black/[0.06] text-[13px]">
                      <div className="px-5 py-3 flex items-center justify-between gap-4">
                        <span className="text-[#86868b] w-24 shrink-0">회사명</span>
                        <span className="text-[#1d1d1f] text-right">{activeContact.company || '-'}</span>
                      </div>
                      <div className="px-5 py-3 flex items-center justify-between gap-4">
                        <span className="text-[#86868b] w-24 shrink-0">부서명</span>
                        <span className="text-[#1d1d1f] text-right">{activeContact.department || '-'}</span>
                      </div>
                      <div className="px-5 py-3 flex items-center justify-between gap-4">
                        <span className="text-[#86868b] w-24 shrink-0">직책</span>
                        <span className="text-[#1d1d1f] text-right">{activeContact.position || '-'}</span>
                      </div>
                      <div className="px-5 py-3 flex items-center justify-between gap-4">
                        <span className="text-[#86868b] w-24 shrink-0">그룹</span>
                        <span className="text-[#1d1d1f] text-right">{activeContact.groupName || '미지정'}</span>
                      </div>
                      <div className="px-5 py-3 flex items-center justify-between gap-4">
                        <span className="text-[#86868b] w-24 shrink-0">생일</span>
                        <span className="text-[#1d1d1f] tabular-nums text-right">
                          {activeContact.birthday || '-'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card 3: 주소 정보 */}
                <div className="rounded-2xl bg-[#f5f5f7] border border-black/[0.06] overflow-hidden">
                  <div className="px-5 py-2.5 border-b border-black/[0.06] text-[11px] font-semibold text-[#86868b]">
                    주소
                  </div>
                  <div className="divide-y divide-black/[0.06] text-[13px]">
                    <div className="px-5 py-3 flex items-center justify-between gap-4">
                      <span className="text-[#86868b] w-24 shrink-0">우편번호</span>
                      <span className="text-[#1d1d1f] tabular-nums text-right">
                        {activeContact.postalCode || '-'}
                      </span>
                    </div>
                    <div className="px-5 py-3 flex items-start justify-between gap-4">
                      <span className="text-[#86868b] w-24 shrink-0">기본 주소</span>
                      <span className="text-[#1d1d1f] text-right break-words">
                        {activeContact.address || '-'}
                      </span>
                    </div>
                    <div className="px-5 py-3 flex items-start justify-between gap-4">
                      <span className="text-[#86868b] w-24 shrink-0">상세 주소</span>
                      <span className="text-[#1d1d1f] text-right break-words">
                        {activeContact.addressDetail || '-'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card 4: 메모 & 메타 정보 */}
                <div className="rounded-2xl bg-[#f5f5f7] border border-black/[0.06] overflow-hidden">
                  <div className="px-5 py-2.5 border-b border-black/[0.06] text-[11px] font-semibold text-[#86868b]">
                    메모 및 기록
                  </div>
                  <div className="p-5 text-[13px] text-[#1d1d1f] whitespace-pre-wrap leading-relaxed">
                    {activeContact.memo || <span className="text-[#86868b]">등록된 메모가 없습니다.</span>}
                  </div>
                  <div className="px-5 py-2.5 border-t border-black/[0.06] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#86868b] tabular-nums">
                    <span>
                      등록일시: {formatDateParts(activeContact.createdAt).dateStr}{' '}
                      {formatDateParts(activeContact.createdAt).timeStr}
                    </span>
                    {activeContact.updatedAt && (
                      <span>
                        수정일시: {formatDateParts(activeContact.updatedAt).dateStr}{' '}
                        {formatDateParts(activeContact.updatedAt).timeStr}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : activeCompanyUser ? (
          <>
            <div className="h-12 shrink-0 px-6 border-b border-black/[0.06] flex items-center justify-between bg-white/95 backdrop-blur-md">
              <button
                type="button"
                onClick={(e) => handleComposeMail(activeCompanyUser.email, e)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0071e3] hover:bg-[#0077ed] px-3 py-1.5 text-xs font-medium text-white shadow-xs transition"
              >
                <Mail className="h-3.5 w-3.5" />
                <span>메일 쓰기</span>
              </button>
              <span className="text-xs text-[#86868b]">사내 임직원 디렉토리</span>
            </div>

            <div className="flex-1 overflow-y-auto px-8 py-8">
              <div className="max-w-2xl space-y-6">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-indigo-500/12 text-indigo-600 text-xl font-bold flex items-center justify-center shrink-0">
                    {activeCompanyUser.name ? activeCompanyUser.name.slice(0, 1).toUpperCase() : 'U'}
                  </div>
                  <div>
                    <h2 className="text-[22px] font-bold tracking-tight text-[#1d1d1f]">
                      {activeCompanyUser.name}
                    </h2>
                    <p className="text-[13px] text-[#6e6e73] mt-0.5">
                      {activeCompanyUser.role === 'SYSTEM_ADMIN' ? '시스템 관리자' : '일반 사원'}
                      {activeCompanyUser.employeeId ? ` · 사번 ${activeCompanyUser.employeeId}` : ''}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl bg-[#f5f5f7] border border-black/[0.06] divide-y divide-black/[0.06] text-[13px]">
                  <div className="px-5 py-3.5 flex items-center justify-between gap-4">
                    <span className="text-[#86868b] w-24 shrink-0">이메일</span>
                    <button
                      type="button"
                      onClick={(e) => handleComposeMail(activeCompanyUser.email, e)}
                      className="text-[#0071e3] hover:underline font-medium"
                    >
                      {activeCompanyUser.email}
                    </button>
                  </div>
                  <div className="px-5 py-3.5 flex items-center justify-between gap-4">
                    <span className="text-[#86868b] w-24 shrink-0">등록일시</span>
                    <span className="text-[#6e6e73] text-xs tabular-nums">
                      {formatDateParts(activeCompanyUser.createdAt).dateStr}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-[#86868b] p-8 select-none">
            <div className="w-16 h-16 rounded-2xl bg-[#f5f5f7] flex items-center justify-center mb-3">
              <Users className="h-8 w-8 text-[#c7c7cc] stroke-[1.5]" />
            </div>
            <p className="text-[14px] font-medium text-[#6e6e73]">선택된 연락처가 없습니다</p>
            <p className="text-[12px] text-[#86868b] mt-1">
              목록에서 연락처를 선택하면 상세 정보가 표시됩니다.
            </p>
          </div>
        )}
      </div>

      {/* 모달 컴포넌트들 */}
      <ContactModal
        isOpen={contactModalOpen}
        onClose={() => setContactModalOpen(false)}
        contact={selectedContact}
        groups={groups}
        onSaved={() => {
          loadContacts();
          loadGroups();
          window.dispatchEvent(new CustomEvent('contacts:refresh-groups'));
        }}
      />

      <ContactImportModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImported={() => {
          loadContacts();
          loadGroups();
          window.dispatchEvent(new CustomEvent('contacts:refresh-groups'));
        }}
      />

      <ContactGroupModal
        isOpen={groupModalOpen}
        onClose={() => setGroupModalOpen(false)}
        groups={groups}
        onRefresh={() => {
          loadGroups();
          loadContacts();
        }}
      />
    </div>
  );
}
