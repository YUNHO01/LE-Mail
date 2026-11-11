'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { fetchApi } from '@/lib/api';
import {
  Users,
  UserPlus,
  Search,
  Shield,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Mail,
  RefreshCw,
  Copy,
  FileSpreadsheet,
  Printer,
  Check,
  ChevronLeft,
  ChevronRight,
  User,
  Pencil,
  Globe,
  HardDrive,
  Clock,
  BadgeAlert,
  IdCard,
} from 'lucide-react';
import { UserDto, UserRole, DomainDto } from '@lemail/shared-types';
import { PageHeader, SearchInput, TableUtilityButtons } from '@/components/common';
import { exportTableToExcel } from '@/lib/excel';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:9200';

const LANGUAGE_OPTIONS = [
  { value: 'ko', label: 'Korean (한국어)' },
  { value: 'en', label: 'English (영어)' },
  { value: 'ja', label: 'Japanese (일본어)' },
  { value: 'zh', label: 'Chinese (중국어)' },
];

const TIMEZONE_OPTIONS = [
  { value: 'Asia/Seoul', label: 'Asia/Seoul (GMT+09:00)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (GMT+09:00)' },
  { value: 'America/New_York', label: 'America/New_York (GMT-05:00)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (GMT-08:00)' },
  { value: 'Europe/London', label: 'Europe/London (GMT+00:00)' },
  { value: 'Europe/Paris', label: 'Europe/Paris (GMT+01:00)' },
  { value: 'UTC', label: 'UTC (협정 세계시)' },
];

export default function UsersManagementPage() {
  const { token, user: currentUser } = useAuth();

  const [users, setUsers] = useState<UserDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');

  // Selection & Pagination
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // 도메인 목록 (사서함/계정 생성용)
  const [availableDomains, setAvailableDomains] = useState<DomainDto[]>([]);

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [targetUser, setTargetUser] = useState<UserDto | null>(null);

  // 등록 폼 상태
  const [createForm, setCreateForm] = useState<{
    localPart: string;
    selectedDomain: string;
    name: string;
    password: string;
    role: UserRole;
    mailboxQuotaMb: number;
    preferredLanguage: string;
    timezone: string;
    employeeId: string;
  }>({
    localPart: '',
    selectedDomain: '',
    name: '',
    password: '',
    role: UserRole.USER,
    mailboxQuotaMb: 512,
    preferredLanguage: 'ko',
    timezone: 'Asia/Seoul',
    employeeId: '',
  });

  // 수정 폼 상태
  const [editForm, setEditForm] = useState<{
    name: string;
    role: UserRole;
    isActive: boolean;
    mailboxQuotaMb: number;
    preferredLanguage: string;
    timezone: string;
    employeeId: string;
    password?: string;
  }>({
    name: '',
    role: UserRole.USER,
    isActive: true,
    mailboxQuotaMb: 512,
    preferredLanguage: 'ko',
    timezone: 'Asia/Seoul',
    employeeId: '',
    password: '',
  });

  // Alert message
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (roleFilter) params.append('role', roleFilter);

      const res = await fetch(`${API_BASE_URL}/api/users?${params.toString()}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          setMessage({
            type: 'error',
            text: '시스템 관리자 권한이 필요합니다. 먼저 관리자 계정으로 로그인해 주세요.',
          });
        }
        setUsers([]);
        return;
      }

      const data = await res.json();
      setUsers(data.items || []);
      setTotal(data.total || 0);
      setSelectedIds([]);
      setPage(1);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || '사용자 목록을 불러오는 중 오류가 발생했습니다.' });
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableDomains = async () => {
    try {
      const domains = await fetchApi<DomainDto[]>('/domains/active');
      setAvailableDomains(domains || []);
      if (domains && domains.length > 0) {
        const defaultDom = domains.find((d) => d.isDefault) || domains[0];
        setCreateForm((prev) => ({ ...prev, selectedDomain: defaultDom.name }));
      }
    } catch (err) {
      console.error('Failed to load active domains', err);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [token, roleFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchUsers();
  };

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(users.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedUsers = users.slice(startIndex, startIndex + pageSize);

  const displayStart = users.length === 0 ? 0 : startIndex + 1;
  const displayEnd = Math.min(startIndex + pageSize, users.length);

  // Selection handlers
  const allCurrentSelected =
    paginatedUsers.length > 0 && paginatedUsers.every((u) => selectedIds.includes(u.id));

  const handleSelectAll = () => {
    if (allCurrentSelected) {
      setSelectedIds((prev) => prev.filter((id) => !paginatedUsers.some((u) => u.id === id)));
    } else {
      const toAdd = paginatedUsers.map((u) => u.id);
      setSelectedIds((prev) => Array.from(new Set([...prev, ...toAdd])));
    }
  };

  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Copy to Clipboard
  const handleCopy = async () => {
    const targets =
      selectedIds.length > 0
        ? users.filter((u) => selectedIds.includes(u.id))
        : paginatedUsers;

    if (targets.length === 0) return;

    const header = ['이름', '사번', '이메일', '할당용량', '언어', '타임존', '역할', '상태', '최종 로그인', '등록일'].join('\t');
    const rows = targets.map((u) => {
      const roleStr = u.role === UserRole.SYSTEM_ADMIN ? '시스템 관리자' : '일반 사용자';
      const statusStr = u.isActive ? '활성' : '비활성';
      const lastLogin = u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('ko-KR') : '미접속';
      const created = new Date(u.createdAt).toLocaleDateString('ko-KR');
      return [
        u.name,
        u.employeeId || '-',
        u.email,
        `${u.mailboxQuotaMb ?? 512} MB`,
        u.preferredLanguage || 'ko',
        u.timezone || 'Asia/Seoul',
        roleStr,
        statusStr,
        lastLogin,
        created,
      ].join('\t');
    });

    const text = [header, ...rows].join('\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Export to Excel (.xlsx) (해당 페이지 목록 또는 선택된 항목)
  const handleExportExcel = () => {
    const targets =
      selectedIds.length > 0
        ? users.filter((u) => selectedIds.includes(u.id))
        : paginatedUsers;

    if (targets.length === 0) {
      alert('내보낼 데이터가 없습니다.');
      return;
    }

    const headers = ['이름', '사번', '이메일', '할당용량(MB)', '사용량(MB)', '언어', '타임존', '역할', '상태', '최종 로그인', '등록일자'];
    const rows = targets.map((u) => {
      const roleStr = u.role === UserRole.SYSTEM_ADMIN ? '시스템 관리자' : '일반 사용자';
      const statusStr = u.isActive ? '활성' : '비활성';
      const lastLogin = u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('ko-KR') : '미접속';
      const created = new Date(u.createdAt).toISOString().slice(0, 10);
      return [
        u.name,
        u.employeeId || '-',
        u.email,
        u.mailboxQuotaMb ?? 512,
        u.usedMb ?? 0,
        u.preferredLanguage || 'ko',
        u.timezone || 'Asia/Seoul',
        roleStr,
        statusStr,
        lastLogin,
        created,
      ];
    });

    const today = new Date().toISOString().slice(0, 10);
    exportTableToExcel({
      filename: `LEMail_Users_${today}.xlsx`,
      sheetName: '사용자목록',
      headers,
      rows,
    });
  };

  // Print Action
  const handlePrint = () => {
    window.print();
  };

  // 신규 등록 모달 열기
  const openCreateModal = () => {
    loadAvailableDomains();
    setCreateForm({
      localPart: '',
      selectedDomain: '',
      name: '',
      password: '',
      role: UserRole.USER,
      mailboxQuotaMb: 512,
      preferredLanguage: 'ko',
      timezone: 'Asia/Seoul',
      employeeId: '',
    });
    setIsCreateModalOpen(true);
  };

  // 신규 사용자 등록 핸들러
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    const local = createForm.localPart.trim();
    if (!local) {
      alert('메일 ID(계정 아이디)를 입력해 주세요.');
      return;
    }
    if (!createForm.selectedDomain) {
      alert('도메인을 선택해 주세요.');
      return;
    }

    const fullEmail = `${local}@${createForm.selectedDomain}`.toLowerCase();

    try {
      const res = await fetch(`${API_BASE_URL}/api/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          email: fullEmail,
          name: createForm.name.trim(),
          password: createForm.password,
          role: createForm.role,
          mailboxQuotaMb: Number(createForm.mailboxQuotaMb) || 512,
          preferredLanguage: createForm.preferredLanguage,
          timezone: createForm.timezone,
          employeeId: createForm.employeeId.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || '사용자 등록 실패');
      }

      setMessage({
        type: 'success',
        text: `사용자 '${data.name} (${data.email})' 등록 완료! 전용 사서함이 함께 생성되었습니다.`,
      });
      setIsCreateModalOpen(false);
      fetchUsers();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  // 수정 모달 열기
  const openEditModal = (target: UserDto) => {
    setTargetUser(target);
    setEditForm({
      name: target.name,
      role: target.role,
      isActive: target.isActive,
      mailboxQuotaMb: target.mailboxQuotaMb ?? 512,
      preferredLanguage: target.preferredLanguage || 'ko',
      timezone: target.timezone || 'Asia/Seoul',
      employeeId: target.employeeId || '',
      password: '',
    });
    setIsEditModalOpen(true);
  };

  // 사용자 정보 수정 핸들러 (메일ID, 도메인 제외 수정 및 비밀번호 설정)
  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUser) return;
    setMessage(null);

    if (editForm.password && editForm.password.trim().length > 0) {
      if (editForm.password.trim().length < 6) {
        alert('비밀번호는 최소 6자 이상이어야 합니다.');
        return;
      }
    }

    try {
      const payload: any = {
        name: editForm.name.trim(),
        role: editForm.role,
        isActive: editForm.isActive,
        mailboxQuotaMb: Number(editForm.mailboxQuotaMb) || 512,
        preferredLanguage: editForm.preferredLanguage,
        timezone: editForm.timezone,
        employeeId: editForm.employeeId.trim() || null,
      };

      if (editForm.password && editForm.password.trim().length >= 6) {
        payload.password = editForm.password.trim();
      }

      const res = await fetch(`${API_BASE_URL}/api/users/${targetUser.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || '사용자 정보 수정 실패');
      }

      setMessage({
        type: 'success',
        text: `'${data.name}' 사용자의 정보(및 비밀번호)가 성공적으로 수정되었습니다.`,
      });
      setIsEditModalOpen(false);
      fetchUsers();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  // 계정 활성/비활성 토글
  const handleToggleActive = async (target: UserDto) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/users/${target.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ isActive: !target.isActive }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || '상태 변경 실패');
      }

      setMessage({
        type: 'success',
        text: `'${target.name}' 사용자의 활성 상태를 변경했습니다.`,
      });
      fetchUsers();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  // 단일 사용자 삭제
  const handleDeleteUser = async (target: UserDto) => {
    if (!confirm(`'${target.name} (${target.email})' 사용자를 정말 삭제하시겠습니까?\n사서함도 함께 비활성화됩니다.`)) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/users/${target.id}`, {
        method: 'DELETE',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || '삭제 실패');
      }

      setMessage({ type: 'success', text: data.message || '사용자가 성공적으로 삭제되었습니다.' });
      fetchUsers();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  // 일괄 삭제
  const handleBulkDelete = async () => {
    const validTargets = selectedIds.filter((id) => id !== currentUser?.id);
    if (validTargets.length === 0) {
      alert('삭제할 수 있는 대상 사용자가 없습니다. (본인 계정 제외)');
      return;
    }

    if (!confirm(`선택한 ${validTargets.length}명의 사용자를 삭제하시겠습니까?`)) {
      return;
    }

    try {
      await Promise.all(
        validTargets.map((id) =>
          fetch(`${API_BASE_URL}/api/users/${id}`, {
            method: 'DELETE',
            headers: {
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          })
        )
      );
      setMessage({ type: 'success', text: `${validTargets.length}명의 사용자가 삭제되었습니다.` });
      fetchUsers();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || '일괄 삭제 중 오류가 발생했습니다.' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <PageHeader
        title="사용자 계정 관리"
        icon={<Users className="h-6 w-6 text-sky-600" />}
        subtitle="메일 시스템 접속 계정과 사서함 할당량, 언어, 사번 등 조직원 프로필을 관리합니다."
        action={
          <button
            onClick={openCreateModal}
            className="btn btn-sm btn-primary inline-flex items-center gap-1.5 text-xs font-semibold print:hidden"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>신규 사용자 등록</span>
          </button>
        }
      />

      {/* Alert Message Box */}
      {message && (
        <div
          className={`flex items-center justify-between rounded-xl p-4 text-xs font-medium border animate-in fade-in duration-200 print:hidden ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {message.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
          <button
            onClick={() => setMessage(null)}
            className="text-slate-400 hover:text-slate-600 font-bold ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Table Container */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden transition printable-area">
        {/* 인쇄 전용 헤더 (인쇄 시 상단에만 노출) */}
        <div className="hidden print:block p-4 border-b-2 border-slate-800">
          <h2 className="text-base font-bold text-slate-900">[LEMail] 사용자 계정 목록</h2>
          <div className="text-xs text-slate-600 mt-1">
            출력일시: {new Date().toLocaleString('ko-KR')} | 목록 {paginatedUsers.length}건
          </div>
        </div>

        {/* 상단 툴바: 필터 (좌: 역할 -> 검색) / 유틸리티 버튼군 (우) */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white print-toolbar print:hidden">
          {/* 좌측 필터 그룹: [상태/권한] -> [검색창] (ams 표준 순서 준수) */}
          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none transition focus:border-sky-500 shadow-xs"
            >
              <option value="">모든 권한</option>
              <option value={UserRole.USER}>일반 사용자</option>
              <option value={UserRole.SYSTEM_ADMIN}>시스템 관리자</option>
            </select>

            <div className="w-60">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="이름, 사번 또는 이메일 검색..."
                size="md"
              />
            </div>
          </div>

          {/* 우측 액션 및 유틸리티 버튼군 */}
          <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
            {/* 선택 삭제 버튼 */}
            {selectedIds.length > 0 && (
              <div className="flex items-center gap-1.5 mr-1 pr-2 border-r border-slate-200">
                <span className="text-xs font-semibold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-lg border border-sky-200">
                  {selectedIds.length}명 선택
                </span>
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  className="btn btn-sm btn-secondary text-xs font-medium text-rose-600 hover:text-rose-700 border-rose-200 hover:border-rose-300 bg-rose-50/50"
                >
                  선택 삭제
                </button>
              </div>
            )}

            {/* 표준 3종 유틸리티 버튼 (Copy, Excel, Print) */}
            <TableUtilityButtons
              onCopy={handleCopy}
              onExcel={handleExportExcel}
              onPrint={handlePrint}
              copied={copied}
              extraActions={
                <button
                  type="button"
                  onClick={fetchUsers}
                  title="새로고침"
                  className="btn btn-sm btn-secondary p-1.5 text-slate-500 hover:text-slate-800"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                </button>
              }
            />
          </div>
        </div>

        {/* 데이터 테이블 */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50 text-slate-600 font-medium select-none">
                <th className="w-10 px-4 py-3 text-center print:hidden">
                  <input
                    type="checkbox"
                    checked={allCurrentSelected}
                    onChange={handleSelectAll}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                    title="전체 선택"
                  />
                </th>
                <th className="w-24 px-4 py-3 whitespace-nowrap">등록일자</th>
                <th className="px-4 py-3 whitespace-nowrap">사용자 프로필 (이름/사번/계정)</th>
                <th className="w-48 px-4 py-3 whitespace-nowrap">메일 용량 (사용량 / 사용률)</th>
                <th className="w-32 px-4 py-3 text-center whitespace-nowrap">언어 / 타임존</th>
                <th className="w-28 px-4 py-3 text-center whitespace-nowrap">권한</th>
                <th className="w-24 px-4 py-3 text-center whitespace-nowrap">계정 상태</th>
                <th className="w-28 px-4 py-3 text-center whitespace-nowrap">최종 로그인</th>
                <th className="w-24 px-4 py-3 text-right whitespace-nowrap print:hidden">관리</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="h-5 w-5 animate-spin text-sky-600" />
                      <span className="font-medium">사용자 목록을 불러오는 중...</span>
                    </div>
                  </td>
                </tr>
              ) : paginatedUsers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center">
                      <Users className="h-10 w-10 text-slate-300 mb-2 stroke-1" />
                      <p className="font-semibold text-slate-600 text-sm">등록된 사용자가 없습니다.</p>
                      <p className="text-xs text-slate-400 mt-1">상단의 '신규 사용자 등록' 버튼을 눌러 계정을 생성하세요.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedUsers.map((item) => {
                  const isSelected = selectedIds.includes(item.id);
                  const isSelf = currentUser?.id === item.id;
                  const createdDate = new Date(item.createdAt).toISOString().slice(0, 10);

                  return (
                    <tr
                      key={item.id}
                      onClick={() => openEditModal(item)}
                      className={`transition-colors duration-100 hover:bg-slate-50/80 cursor-pointer ${
                        isSelected ? 'bg-sky-50/40' : 'bg-white'
                      }`}
                      title="클릭하여 사용자 정보 및 비밀번호 수정"
                    >
                      {/* 선택 체크박스 */}
                      <td
                        className="px-4 py-3.5 text-center print:hidden"
                        onClick={(e) => handleToggleSelect(item.id, e)}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                        />
                      </td>

                      {/* 등록일자 */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-slate-600 font-mono">
                        {createdDate}
                      </td>

                      {/* 사용자 프로필 */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xs font-bold text-slate-700 ring-1 ring-slate-200">
                            {item.name ? item.name.slice(0, 1).toUpperCase() : <User className="h-4 w-4" />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => openEditModal(item)}
                                className="font-bold text-slate-900 text-sm hover:text-sky-600 transition hover:underline text-left"
                                title="클릭하여 사용자 정보 수정"
                              >
                                {item.name}
                              </button>
                              {item.employeeId && (
                                <span className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-slate-600 border border-slate-200">
                                  <IdCard className="h-2.5 w-2.5 text-slate-400" />
                                  {item.employeeId}
                                </span>
                              )}
                              {isSelf && (
                                <span className="rounded bg-sky-100 px-1.5 py-0.2 text-[10px] font-semibold text-sky-700 border border-sky-200">
                                  본인
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1">
                              <Mail className="h-3 w-3 text-slate-400" />
                              <span>{item.email}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 메일 용량 (사용량 & 사용률) */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="flex flex-col gap-1 min-w-[150px]">
                          <div className="flex items-center justify-between text-[11px] font-mono">
                            <span className="font-semibold text-slate-800">
                              {item.usedMb ?? 0} MB <span className="text-slate-400 font-normal">/ {item.mailboxQuotaMb ?? 512} MB</span>
                            </span>
                            <span
                              className={`text-[10px] font-bold ${
                                (item.usagePercent ?? 0) >= 90
                                  ? 'text-rose-600'
                                  : (item.usagePercent ?? 0) >= 70
                                  ? 'text-amber-600'
                                  : 'text-sky-600'
                              }`}
                            >
                              {item.usagePercent ?? 0}%
                            </span>
                          </div>
                          {/* 게이지 바 */}
                          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200/60">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                (item.usagePercent ?? 0) >= 90
                                  ? 'bg-rose-500'
                                  : (item.usagePercent ?? 0) >= 70
                                  ? 'bg-amber-500'
                                  : 'bg-sky-500'
                              }`}
                              style={{
                                width: `${Math.min(
                                  100,
                                  Math.max((item.usedMb ?? 0) > 0 ? 2 : 0, item.usagePercent ?? 0),
                                )}%`,
                              }}
                            />
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono flex items-center justify-between">
                            <span>메일 {item.messageCount ?? 0}통</span>
                            <span className="text-[9px] text-slate-400">
                              {item.usagePercent ?? 0}% full
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* 언어 / 타임존 */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap text-slate-600 text-[11px]">
                        <div className="font-medium text-slate-800">
                          {LANGUAGE_OPTIONS.find((l) => l.value === item.preferredLanguage)?.label.split(' ')[0] || item.preferredLanguage || 'Korean'}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {item.timezone || 'Asia/Seoul'}
                        </div>
                      </td>

                      {/* 역할 */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        {item.role === UserRole.SYSTEM_ADMIN ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 border border-amber-200">
                            <Shield className="h-3 w-3" />
                            <span>관리자</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold text-sky-700 border border-sky-200">
                            <span>사용자</span>
                          </span>
                        )}
                      </td>

                      {/* 계정 상태 */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleActive(item);
                          }}
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition ${
                            item.isActive
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                              : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'
                          }`}
                          title="상태 클릭 시 활성/비활성 토글"
                        >
                          {item.isActive ? (
                            <>
                              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                              <span>정상 활성</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="h-3 w-3 text-slate-400" />
                              <span>비활성</span>
                            </>
                          )}
                        </button>
                      </td>

                      {/* 최종 로그인 */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap text-slate-600 font-mono text-[11px]">
                        {item.lastLoginAt
                          ? new Date(item.lastLoginAt).toLocaleString('ko-KR')
                          : '미접속'}
                      </td>

                      {/* 관리 액션 */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap print:hidden">
                        <div className="flex items-center justify-end">
                          {/* 삭제 버튼 */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteUser(item);
                            }}
                            disabled={isSelf}
                            title={isSelf ? '본인 계정 삭제 불가' : '계정 삭제'}
                            className={`p-1.5 rounded-lg transition ${
                              isSelf
                                ? 'text-slate-200 cursor-not-allowed'
                                : 'text-slate-400 hover:bg-rose-50 hover:text-rose-600'
                            }`}
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

        {/* 하단 페이징 및 카운트 바 */}
        <div className="px-5 py-3.5 border-t border-slate-100 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-slate-500 print:hidden">
          <div>
            총 <span className="font-semibold text-slate-800">{users.length}</span>명 중{' '}
            <span className="font-semibold text-slate-800">
              {displayStart} - {displayEnd}
            </span>
            명 표시
          </div>

          {paginatedUsers.length > 0 && (
            <div className="flex items-center gap-1 self-end sm:self-auto">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition"
                title="이전 페이지"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>

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
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {p}
                  </button>
                );
              })}

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

      {/* Modal: 신규 사용자 등록 (메일ID + 도메인 선택 + 상세 정보) */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-sky-600" />
              <span>신규 사용자 등록</span>
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              사용자 계정 및 사서함(Mailbox)이 등록된 활성 도메인 기반으로 자동 생성됩니다.
            </p>

            {availableDomains.length === 0 ? (
              <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-4 text-xs text-amber-800 space-y-2">
                <div className="flex items-center gap-2 font-bold text-amber-900">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <span>등록된 활성 도메인이 없습니다</span>
                </div>
                <p>
                  사용자를 등록하려면 먼저 메일 서비스 도메인이 등록되어 있어야 합니다.
                </p>
                <div className="pt-2">
                  <Link
                    href="/admin/domains"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-700 transition"
                  >
                    <Globe className="h-3.5 w-3.5" />
                    <span>도메인 관리로 이동하여 등록하기</span>
                  </Link>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateUser} className="mt-5 space-y-4">
                {/* 메일 계정: ID + 도메인 선택 */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    메일 계정 (이메일 주소) <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      required
                      placeholder="메일 ID (예: dh.kim)"
                      value={createForm.localPart}
                      onChange={(e) =>
                        setCreateForm({ ...createForm, localPart: e.target.value })
                      }
                      className="h-10 flex-1 rounded-xl border border-slate-300 px-3 text-xs outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 font-mono"
                    />
                    <span className="text-slate-400 font-bold select-none">@</span>
                    <select
                      value={createForm.selectedDomain}
                      onChange={(e) =>
                        setCreateForm({ ...createForm, selectedDomain: e.target.value })
                      }
                      className="h-10 rounded-xl border border-slate-300 px-3 text-xs outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 bg-white font-mono min-w-[140px]"
                    >
                      {availableDomains.map((dom) => (
                        <option key={dom.id} value={dom.name}>
                          {dom.name} {dom.isDefault ? '(기본)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  {createForm.localPart && createForm.selectedDomain && (
                    <div className="mt-1 text-[11px] text-slate-500 font-mono">
                      완성 주소: <strong className="text-sky-700">{createForm.localPart.trim().toLowerCase()}@{createForm.selectedDomain}</strong>
                    </div>
                  )}
                </div>

                {/* Display Name (이름) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Display Name (이름) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="예: 김동현"
                    value={createForm.name}
                    onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                    className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                  />
                </div>

                {/* Mailbox Quota (사서함 용량) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Mailbox Quota (메일 용량)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      required
                      min={10}
                      step={10}
                      value={createForm.mailboxQuotaMb}
                      onChange={(e) =>
                        setCreateForm({
                          ...createForm,
                          mailboxQuotaMb: Number(e.target.value),
                        })
                      }
                      className="h-10 w-32 rounded-xl border border-slate-300 px-3 text-xs outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 font-mono"
                    />
                    <span className="text-xs font-semibold text-slate-700">MB</span>
                    <span className="text-[11px] text-slate-400">
                      (기본 512 MB 권장, 1024 MB = 1 GB)
                    </span>
                  </div>
                </div>

                {/* Preferred language & Time zone (2단 그리드) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Preferred language (사용 언어)
                    </label>
                    <select
                      value={createForm.preferredLanguage}
                      onChange={(e) =>
                        setCreateForm({
                          ...createForm,
                          preferredLanguage: e.target.value,
                        })
                      }
                      className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs outline-none focus:border-sky-500 bg-white"
                    >
                      {LANGUAGE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Time zone (타임존)
                    </label>
                    <select
                      value={createForm.timezone}
                      onChange={(e) =>
                        setCreateForm({ ...createForm, timezone: e.target.value })
                      }
                      className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs outline-none focus:border-sky-500 bg-white font-mono text-[11px]"
                    >
                      {TIMEZONE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* User/Employee ID (사번) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    User/Employee ID (사번)
                  </label>
                  <input
                    type="text"
                    placeholder="예: 20261101 또는 EMP0123"
                    value={createForm.employeeId}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, employeeId: e.target.value })
                    }
                    className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 font-mono"
                  />
                </div>

                {/* 초기 비밀번호 & 권한 (2단 그리드) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      초기 비밀번호 <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={createForm.password}
                      onChange={(e) =>
                        setCreateForm({ ...createForm, password: e.target.value })
                      }
                      placeholder="최소 6자 이상"
                      className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      계정 권한
                    </label>
                    <select
                      value={createForm.role}
                      onChange={(e) =>
                        setCreateForm({
                          ...createForm,
                          role: e.target.value as UserRole,
                        })
                      }
                      className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs outline-none focus:border-sky-500 bg-white"
                    >
                      <option value={UserRole.USER}>일반 사용자 (USER)</option>
                      <option value={UserRole.SYSTEM_ADMIN}>시스템 관리자 (SYSTEM_ADMIN)</option>
                    </select>
                  </div>
                </div>

                <div className="mt-6 flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700 transition"
                  >
                    등록 완료
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal: 사용자 정보 수정 (메일ID / 도메인 제외 수정) */}
      {isEditModalOpen && targetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Pencil className="h-5 w-5 text-sky-600" />
              <span>사용자 정보 수정</span>
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              사용자 프로필, 메일 용량 및 시스템 설정 정보를 수정합니다.
            </p>

            <form onSubmit={handleUpdateUser} className="mt-5 space-y-4">
              {/* 메일 계정: 읽기 전용 (수정 불가 안내) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  메일 계정 (이메일 주소)
                </label>
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-mono text-slate-600 select-none">
                  <Mail className="h-4 w-4 text-slate-400" />
                  <span className="font-semibold text-slate-800">{targetUser.email}</span>
                  <span className="ml-auto text-[10px] text-slate-400 bg-white px-2 py-0.5 rounded border border-slate-200">
                    변경 불가 (고유 식별자)
                  </span>
                </div>
              </div>

              {/* Display Name (이름) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Display Name (이름) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                />
              </div>

              {/* Mailbox Quota (사서함 용량) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mailbox Quota (메일 용량)
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="number"
                    required
                    min={10}
                    step={10}
                    value={editForm.mailboxQuotaMb}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        mailboxQuotaMb: Number(e.target.value),
                      })
                    }
                    className="h-10 w-32 rounded-xl border border-slate-300 px-3 text-xs outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 font-mono"
                  />
                  <span className="text-xs font-semibold text-slate-700">MB</span>
                  <span className="text-xs text-slate-700 font-medium bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg">
                    ({targetUser.usagePercent ?? 0}% full, {targetUser.messageCount ?? 0} messages, {targetUser.usedMb ?? 0} MB.)
                  </span>
                </div>
              </div>

              {/* Preferred language & Time zone (2단 그리드) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Preferred language (사용 언어)
                  </label>
                  <select
                    value={editForm.preferredLanguage}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        preferredLanguage: e.target.value,
                      })
                    }
                    className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs outline-none focus:border-sky-500 bg-white"
                  >
                    {LANGUAGE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Time zone (타임존)
                  </label>
                  <select
                    value={editForm.timezone}
                    onChange={(e) =>
                      setEditForm({ ...editForm, timezone: e.target.value })
                    }
                    className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs outline-none focus:border-sky-500 bg-white font-mono text-[11px]"
                  >
                    {TIMEZONE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* User/Employee ID (사번) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  User/Employee ID (사번)
                </label>
                <input
                  type="text"
                  placeholder="예: 20261101 또는 EMP0123"
                  value={editForm.employeeId}
                  onChange={(e) =>
                    setEditForm({ ...editForm, employeeId: e.target.value })
                  }
                  className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 font-mono"
                />
              </div>

              {/* 비밀번호 변경 (선택) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  비밀번호 재설정 (선택)
                </label>
                <input
                  type="password"
                  minLength={6}
                  placeholder="변경할 새 비밀번호 입력 (기존 비밀번호 유지 시 빈칸)"
                  value={editForm.password || ''}
                  onChange={(e) =>
                    setEditForm({ ...editForm, password: e.target.value })
                  }
                  className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  * 기존 비밀번호를 유지하려면 빈칸으로 두세요 (변경 시 최소 6자 이상).
                </span>
              </div>

              {/* 권한 & 계정 상태 (2단 그리드) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    계정 권한
                  </label>
                  <select
                    value={editForm.role}
                    disabled={currentUser?.id === targetUser.id}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        role: e.target.value as UserRole,
                      })
                    }
                    className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs outline-none focus:border-sky-500 bg-white disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    <option value={UserRole.USER}>일반 사용자 (USER)</option>
                    <option value={UserRole.SYSTEM_ADMIN}>시스템 관리자 (SYSTEM_ADMIN)</option>
                  </select>
                  {currentUser?.id === targetUser.id && (
                    <span className="text-[10px] text-amber-600 mt-0.5 block">
                      본인 계정의 권한은 변경할 수 없습니다.
                    </span>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    계정 활성 상태
                  </label>
                  <select
                    value={editForm.isActive ? 'true' : 'false'}
                    disabled={currentUser?.id === targetUser.id}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        isActive: e.target.value === 'true',
                      })
                    }
                    className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs outline-none focus:border-sky-500 bg-white disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    <option value="true">정상 활성 (Active)</option>
                    <option value="false">계정 비활성 (Inactive)</option>
                  </select>
                  {currentUser?.id === targetUser.id && (
                    <span className="text-[10px] text-amber-600 mt-0.5 block">
                      본인 계정은 비활성화할 수 없습니다.
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700 transition"
                >
                  변경사항 저장
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
