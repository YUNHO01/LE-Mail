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
import { PageHeader, SearchInput, TableUtilityButtons } from '@/components/common';
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
  const pageSize = 10;
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  // 필터 상태
  const [statusFilter, setStatusFilter] = useState<'all' | 'starred' | 'has_email' | 'has_phone'>('all');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterMenuRef = useRef<HTMLDivElement>(null);

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
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target as Node)) {
        setIsFilterOpen(false);
      }
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
    { value: 'all', label: '전체' },
    { value: 'starred', label: '중요 연락처' },
    { value: 'has_email', label: '이메일 보유' },
    { value: 'has_phone', label: '전화번호 보유' },
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
        (u.employeeId && u.employeeId.toLowerCase().includes(s)),
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
            '-',
            '사내',
            u.employeeId ? `사번: ${u.employeeId}` : '-',
            '-',
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
          '-',
          '사내',
          u.employeeId ? `사번: ${u.employeeId}` : '-',
          '-',
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

  return (
    <div className="space-y-6">
      {/* 1. 편지함 스타일 표준 PageHeader */}
      <PageHeader
        title={getCategoryTitle()}
        icon={<Users className="h-6 w-6 text-sky-600" />}
        subtitle="연락처를 관리하고 외부 주소록과 연동하거나 메일을 작성하세요."
        action={
          currentGroupId !== 'company' && (
            <div className="flex items-center gap-2 flex-wrap print:hidden">
              {/* 그룹 관리 버튼 */}
              <button
                type="button"
                onClick={() => setGroupModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-xs transition"
              >
                <Tag className="h-3.5 w-3.5 text-slate-500" />
                <span>그룹 관리</span>
              </button>

              {/* 가져오기 버튼 */}
              <button
                type="button"
                onClick={() => setImportModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-xs transition"
              >
                <Upload className="h-3.5 w-3.5 text-emerald-600" />
                <span>가져오기</span>
              </button>

              {/* 내보내기 드롭다운 */}
              <div className="relative" ref={exportMenuRef}>
                <button
                  type="button"
                  onClick={() => setExportMenuOpen(!exportMenuOpen)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-xs transition"
                >
                  <Download className="h-3.5 w-3.5 text-sky-600" />
                  <span>내보내기</span>
                  <ChevronDown className="h-3 w-3 text-slate-400" />
                </button>

                {exportMenuOpen && (
                  <div className="absolute right-0 mt-1.5 w-52 rounded-xl bg-white border border-slate-200 shadow-xl py-1 z-30 text-xs animate-in fade-in zoom-in-95 duration-100">
                    <button
                      type="button"
                      onClick={() => handleExport('xlsx')}
                      className="w-full text-left px-3.5 py-2 text-slate-700 hover:bg-slate-50 transition"
                    >
                      <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                        <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                        <span>Excel 통합문서 (.xlsx)</span>
                      </div>
                      <div className="text-[10px] text-slate-400">15개 표준 항목 전체 포함 양식</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExport('csv')}
                      className="w-full text-left px-3.5 py-2 text-slate-700 hover:bg-slate-50 transition border-t border-slate-100"
                    >
                      <div className="font-semibold text-slate-800">Outlook 호환 CSV (.csv)</div>
                      <div className="text-[10px] text-slate-400">Windows/Outlook 호환 텍스트</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExport('vcf')}
                      className="w-full text-left px-3.5 py-2 text-slate-700 hover:bg-slate-50 transition border-t border-slate-100"
                    >
                      <div className="font-semibold text-slate-800">vCard 포맷 (.vcf)</div>
                      <div className="text-[10px] text-slate-400">스마트폰 / Apple / 표준 주소록</div>
                    </button>
                  </div>
                )}
              </div>

              {/* 새 연락처 추가 버튼 */}
              <button
                type="button"
                onClick={() => {
                  setSelectedContact(null);
                  setContactModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-md shadow-sky-600/20 transition active:scale-[0.98]"
              >
                <UserPlus className="h-3.5 w-3.5" />
                <span>새 연락처</span>
              </button>
            </div>
          )
        }
      />

      {/* 2. 편지함 스타일 일체형 데이터 테이블 카드 */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
        {/* 인쇄 전용 타이틀 헤더 */}
        <div className="hidden print:block p-4 border-b-2 border-slate-800">
          <h2 className="text-base font-bold text-slate-900">
            [LEMail] {getCategoryTitle()} 목록
          </h2>
          <div className="text-xs text-slate-600 mt-1">
            출력일시: {new Date().toLocaleString('ko-KR')} | 목록 {currentGroupId === 'company' ? paginatedCompanyUsers.length : paginatedContacts.length}건
          </div>
        </div>

        {/* 상단 통합 툴바 영역 (카드 상단 헤더) */}
        <div className="p-4 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white print:hidden">
          {/* 좌측: 필터 + 검색창 */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {currentGroupId !== 'company' && (
              <div className="relative shrink-0" ref={filterMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsFilterOpen(!isFilterOpen)}
                  className="flex items-center gap-1.5 rounded-lg bg-white border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-xs hover:border-slate-300 hover:bg-slate-50 transition cursor-pointer select-none"
                >
                  <Filter className="w-3.5 h-3.5 text-slate-500" />
                  <span className="font-semibold text-slate-800">
                    {filterOptions.find((o) => o.value === statusFilter)?.label || '전체'}
                  </span>
                  <ChevronDown
                    className={`w-3 h-3 text-slate-400 transition-transform duration-150 ${
                      isFilterOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {isFilterOpen && (
                  <div className="absolute left-0 top-full mt-1.5 w-40 rounded-xl border border-slate-200 bg-white py-1.5 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-3 py-1 border-b border-slate-100 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      연락처 필터
                    </div>
                    {filterOptions.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setStatusFilter(opt.value as any);
                          setIsFilterOpen(false);
                          setPage(1);
                        }}
                        className={`w-full px-3 py-1.5 text-left text-xs flex items-center justify-between transition ${
                          statusFilter === opt.value
                            ? 'bg-sky-50 text-sky-800 font-semibold'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span>{opt.label}</span>
                        {statusFilter === opt.value && (
                          <Check className="w-3.5 h-3.5 text-sky-600" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 표준 SearchInput */}
            <div className="w-full sm:w-64">
              <SearchInput
                value={searchTerm}
                onChange={setSearchTerm}
                placeholder="이름, 이메일, 전화번호 검색..."
                size="md"
              />
            </div>
          </div>

          {/* 우측: 다중 선택 일괄 액션 & 표준 TableUtility 3종 버튼 */}
          <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap sm:flex-nowrap">
            {selectedIds.length > 0 && currentGroupId !== 'company' && (
              <div className="flex items-center gap-1.5 mr-1 pr-2 border-r border-slate-200">
                <span className="text-xs font-semibold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-lg border border-sky-200">
                  {selectedIds.length}개 선택
                </span>
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  className="px-2.5 py-1 rounded-lg border border-rose-200 bg-rose-50/60 hover:bg-rose-100 text-rose-600 text-xs font-medium transition inline-flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>삭제</span>
                </button>
              </div>
            )}

            <TableUtilityButtons
              onCopy={handleCopy}
              onExcel={handleExcelExport}
              onPrint={handlePrint}
              copied={copied}
            />
          </div>
        </div>

        {/* 3. 데이터 테이블 영역 */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50 text-slate-600 font-medium select-none">
                <th className="w-10 px-3 py-3 text-center print:hidden">
                  <input
                    type="checkbox"
                    checked={allCurrentSelected}
                    onChange={handleSelectAll}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                    title="전체 선택"
                  />
                </th>
                <th className="w-12 px-2 py-3 text-center whitespace-nowrap">상태</th>
                <th className="w-36 px-3 py-3 whitespace-nowrap">이름</th>
                <th className="w-48 px-3 py-3 whitespace-nowrap">이메일</th>
                <th className="w-36 px-3 py-3 whitespace-nowrap">전화번호</th>
                <th className="w-36 px-3 py-3 whitespace-nowrap">회사명</th>
                <th className="w-32 px-3 py-3 whitespace-nowrap">부서명</th>
                <th className="w-28 px-3 py-3 whitespace-nowrap">그룹</th>
                <th className="w-32 px-3 py-3 text-center whitespace-nowrap">등록일시</th>
                <th className="w-24 px-3 py-3 text-right whitespace-nowrap print:hidden">관리</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-20 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="h-5 w-5 animate-spin text-sky-600" />
                      <span className="font-medium">주소록 데이터를 불러오는 중...</span>
                    </div>
                  </td>
                </tr>
              ) : currentGroupId === 'company' ? (
                /* 사내 임직원 목록 */
                paginatedCompanyUsers.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-20 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center">
                        <Users className="h-10 w-10 text-slate-300 mb-2 stroke-1" />
                        <p className="font-semibold text-slate-600 text-sm">
                          등록된 사내 임직원이 없습니다.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedCompanyUsers.map((u) => {
                    const isSelected = selectedIds.includes(u.id);
                    const { dateStr, timeStr } = formatDateParts(u.createdAt);
                    return (
                      <tr
                        key={u.id}
                        className={`transition cursor-default ${
                          isSelected ? 'bg-sky-50/50' : 'hover:bg-slate-50/70'
                        }`}
                      >
                        {/* 1. Checkbox */}
                        <td className="px-3 py-3.5 text-center print:hidden">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => handleToggleSelect(u.id, e)}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                          />
                        </td>

                        {/* 2. 상태 (사내 임직원 표시) */}
                        <td className="px-2 py-3.5 text-center">
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-indigo-50 text-indigo-600 border border-indigo-200 shrink-0" title="사내 임직원">
                            <Building2 className="h-3.5 w-3.5" />
                          </span>
                        </td>

                        {/* 3. 이름 */}
                        <td className="px-3 py-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200">
                              {u.name ? u.name.slice(0, 1).toUpperCase() : 'U'}
                            </div>
                            <span className="font-semibold text-slate-900 truncate">
                              {u.name}
                            </span>
                          </div>
                        </td>

                        {/* 4. 이메일 */}
                        <td className="px-3 py-3.5 whitespace-nowrap">
                          <span
                            onClick={(e) => handleComposeMail(u.email, e)}
                            className="font-mono text-slate-700 hover:text-sky-600 hover:underline cursor-pointer"
                            title="클릭하여 메일 작성"
                          >
                            {u.email}
                          </span>
                        </td>

                        {/* 5. 전화번호 */}
                        <td className="px-3 py-3.5 whitespace-nowrap font-mono text-slate-400">
                          -
                        </td>

                        {/* 6. 회사명 */}
                        <td className="px-3 py-3.5 whitespace-nowrap font-medium text-slate-800">
                          사내
                        </td>

                        {/* 7. 부서명 */}
                        <td className="px-3 py-3.5 whitespace-nowrap text-slate-500">
                          {u.employeeId ? `사번: ${u.employeeId}` : '-'}
                        </td>

                        {/* 8. 그룹 */}
                        <td className="px-3 py-3.5 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-600 border border-indigo-200">
                            {u.role === 'SYSTEM_ADMIN' ? '시스템 관리자' : '일반 사원'}
                          </span>
                        </td>

                        {/* 9. 등록일시 */}
                        <td className="px-3 py-3.5 text-center whitespace-nowrap font-mono text-slate-500">
                          <div>{dateStr}</div>
                          <div className="text-[10px] text-slate-400">{timeStr}</div>
                        </td>

                        {/* 10. 관리 */}
                        <td className="px-3 py-3.5 text-right whitespace-nowrap print:hidden">
                          <button
                            type="button"
                            onClick={(e) => handleComposeMail(u.email, e)}
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-sky-50 hover:text-sky-600 transition"
                            title="메일 쓰기"
                          >
                            <Mail className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )
              ) : paginatedContacts.length === 0 ? (
                /* 일반 주소록 비어있을 때 */
                <tr>
                  <td colSpan={10} className="py-20 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center">
                      <Users className="h-10 w-10 text-slate-300 mb-2 stroke-1" />
                      <p className="font-semibold text-slate-600 text-sm">
                        등록된 연락처가 없습니다.
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        [새 연락처]를 추가하거나 아웃룩 등에서 [가져오기]를 진행해 보세요.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedContact(null);
                          setContactModalOpen(true);
                        }}
                        className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-md shadow-sky-600/20 transition active:scale-[0.98]"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        <span>새 연락처 추가하기</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                /* 일반 주소록 목록 렌더링 */
                paginatedContacts.map((c) => {
                  const isSelected = selectedIds.includes(c.id);
                  const { dateStr, timeStr } = formatDateParts(c.createdAt);
                  const displayPhone = c.phone
                    ? (c.mobileCountryCode && c.mobileCountryCode !== '+82' ? `${c.mobileCountryCode} ` : '') + c.phone
                    : c.companyPhone || null;

                  return (
                    <tr
                      key={c.id}
                      onClick={() => {
                        setSelectedContact(c);
                        setContactModalOpen(true);
                      }}
                      className={`transition cursor-pointer ${
                        isSelected ? 'bg-sky-50/50' : 'hover:bg-slate-50/70'
                      }`}
                    >
                      {/* 1. Checkbox */}
                      <td className="px-3 py-3.5 text-center print:hidden" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => handleToggleSelect(c.id, e)}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                        />
                      </td>

                      {/* 2. 상태 (중요 별표 아이콘) */}
                      <td className="px-2 py-3.5 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={(e) => handleToggleStar(c.id, e)}
                          title={c.isStarred ? '중요 (클릭하여 해제)' : '중요 표시'}
                          className="p-0.5 rounded hover:bg-amber-50 transition shrink-0"
                        >
                          <Star
                            className={`h-4 w-4 ${
                              c.isStarred
                                ? 'fill-amber-400 text-amber-400'
                                : 'text-slate-300 hover:text-amber-400'
                            }`}
                          />
                        </button>
                      </td>

                      {/* 3. 이름 (아바타 + 이름 + 직급) */}
                      <td className="px-3 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold bg-sky-100 text-sky-700 ring-1 ring-sky-200">
                            {c.name ? c.name.slice(0, 1).toUpperCase() : <User className="h-3.5 w-3.5" />}
                          </div>
                          <div className="min-w-0">
                            <span className="font-semibold text-slate-900 truncate">
                              {c.name || '-'}
                            </span>
                            {c.position && (
                              <span className="ml-1.5 text-[11px] text-slate-400 font-normal">
                                {c.position}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 4. 이메일 (분리된 컬럼) */}
                      <td className="px-3 py-3.5 whitespace-nowrap">
                        {c.email ? (
                          <span
                            onClick={(e) => handleComposeMail(c.email!, e)}
                            className="font-mono text-slate-700 hover:text-sky-600 hover:underline cursor-pointer"
                            title="클릭하여 메일 작성"
                          >
                            {c.email}
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* 5. 전화번호 (분리된 컬럼) */}
                      <td className="px-3 py-3.5 whitespace-nowrap font-mono text-slate-600">
                        {displayPhone || <span className="text-slate-300 font-sans">-</span>}
                      </td>

                      {/* 6. 회사명 (분리된 컬럼) */}
                      <td className="px-3 py-3.5 whitespace-nowrap font-medium text-slate-800">
                        {c.company || <span className="text-slate-300 font-normal">-</span>}
                      </td>

                      {/* 7. 부서명 (분리된 컬럼) */}
                      <td className="px-3 py-3.5 whitespace-nowrap text-slate-600">
                        {c.department || <span className="text-slate-300">-</span>}
                      </td>

                      {/* 8. 그룹 */}
                      <td className="px-3 py-3.5 whitespace-nowrap">
                        {c.groupName ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-700 border border-slate-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                            <span>{c.groupName}</span>
                          </span>
                        ) : (
                          <span className="text-slate-300 text-[11px]">-</span>
                        )}
                      </td>

                      {/* 9. 등록일시 */}
                      <td className="px-3 py-3.5 text-center whitespace-nowrap font-mono text-slate-500">
                        <div>{dateStr}</div>
                        <div className="text-[10px] text-slate-400">{timeStr}</div>
                      </td>

                      {/* 10. 관리 (메일 쓰기, 수정, 삭제) */}
                      <td className="px-3 py-3.5 text-right whitespace-nowrap print:hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {c.email && (
                            <button
                              type="button"
                              onClick={(e) => handleComposeMail(c.email!, e)}
                              className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-sky-600 transition"
                              title="메일 쓰기"
                            >
                              <Mail className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedContact(c);
                              setContactModalOpen(true);
                            }}
                            className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                            title="수정"
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDelete(c.id, c.name, e)}
                            className="p-1 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                            title="삭제"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 4. 편지함 스타일 하단 페이징 및 카운트 바 */}
        <div className="px-5 py-3.5 border-t border-slate-100 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-slate-500 print:hidden">
          <div>
            총 <span className="font-semibold text-slate-800">{activeItemsCount}</span>명 중{' '}
            <span className="font-semibold text-slate-800">
              {displayStart} - {displayEnd}
            </span>
            명 표시
          </div>

          {activeItemsCount > 0 && (
            <div className="flex items-center gap-1 self-end sm:self-auto">
              {/* 이전 버튼 */}
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition"
                title="이전 페이지"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>

              {/* 번호형 페이지 버튼 */}
              {Array.from({ length: totalPages }).map((_, i) => {
                const p = i + 1;
                const isActive = p === currentPage;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPage(p)}
                    className={`h-7 w-7 rounded-lg text-xs font-semibold transition ${
                      isActive
                        ? 'bg-sky-600 text-white shadow-xs'
                        : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {p}
                  </button>
                );
              })}

              {/* 다음 버튼 */}
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition"
                title="다음 페이지"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
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
