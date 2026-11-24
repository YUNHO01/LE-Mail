'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { fetchApi, orgApi } from '@/lib/api';
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
  FolderPlus,
  X,
} from 'lucide-react';
import {
  UserDto,
  UserRole,
  DomainDto,
  DepartmentDto,
  EmploymentStatus,
  OrgRankDto,
  OrgTitleDto,
} from '@lemail/shared-types';
import { PageHeader, SearchInput, TableUtilityButtons, SelectDropdown, ToggleSwitch } from '@/components/common';
import { DepartmentTreePanel, DepartmentTreePanelHandle } from '@/components/org/DepartmentTreePanel';
import { exportTableToExcel } from '@/lib/excel';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

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
  const router = useRouter();
  const { token, user: currentUser } = useAuth();

  const [users, setUsers] = useState<UserDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const deptTreeRef = useRef<DepartmentTreePanelHandle | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [selectedDeptName, setSelectedDeptName] = useState<string>('');
  const [includeSubDepartments, setIncludeSubDepartments] = useState<boolean>(true);

  // Selection & Pagination
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [copiedUserId, setCopiedUserId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // 도메인 목록 (사서함/계정 생성용)
  const [availableDomains, setAvailableDomains] = useState<DomainDto[]>([]);

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [targetUser, setTargetUser] = useState<UserDto | null>(null);

  // 등록 폼 상태
  const [departments, setDepartments] = useState<DepartmentDto[]>([]);
  const departmentTreeOptions = useMemo(() => {
    const opts: { value: string; label: string; indent?: number; treePrefix?: string }[] = [
      { value: '', label: '미지정' },
    ];
    const childrenByParent = new Map<string, DepartmentDto[]>();
    const idSet = new Set(departments.map((d) => d.id));
    for (const d of departments) {
      const pid = d.parentId && idSet.has(d.parentId) ? d.parentId : '__root__';
      const arr = childrenByParent.get(pid) || [];
      arr.push(d);
      childrenByParent.set(pid, arr);
    }
    const walk = (parentId: string, depth = 0) => {
      const list = childrenByParent.get(parentId) || [];
      list.forEach((d, idx) => {
        const isLast = idx === list.length - 1;
        opts.push({
          value: d.id,
          label: d.name,
          indent: depth > 0 ? depth - 1 : 0,
          treePrefix: depth > 0 ? (isLast ? '└' : '├') : undefined,
        });
        walk(d.id, depth + 1);
      });
    };
    walk('__root__', 0);
    return opts;
  }, [departments]);
  const [orgRanks, setOrgRanks] = useState<OrgRankDto[]>([]);
  const [orgTitles, setOrgTitles] = useState<OrgTitleDto[]>([]);
  const [createForm, setCreateForm] = useState<{
    localPart: string;
    selectedDomain: string;
    name: string;
    password: string;
    role: UserRole;
    mailboxQuotaMb: number | '';
    preferredLanguage: string;
    timezone: string;
    employeeId: string;
    departmentId: string;
    position: string;
    jobTitle: string;
    phone: string;
    sendWelcomeMail: boolean;
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
    departmentId: '',
    position: '',
    jobTitle: '',
    phone: '',
    sendWelcomeMail: true,
  });

  // 수정 폼 상태
  const [editForm, setEditForm] = useState<{
    name: string;
    role: UserRole;
    isActive: boolean;
    mailboxQuotaMb: number | '';
    preferredLanguage: string;
    timezone: string;
    employeeId: string;
    departmentId: string;
    position: string;
    jobTitle: string;
    phone: string;
    employmentStatus: EmploymentStatus;
    password?: string;
  }>({
    name: '',
    role: UserRole.USER,
    isActive: true,
    mailboxQuotaMb: 512,
    preferredLanguage: 'ko',
    timezone: 'Asia/Seoul',
    employeeId: '',
    departmentId: '',
    position: '',
    jobTitle: '',
    phone: '',
    employmentStatus: 'ACTIVE',
    password: '',
  });

  // Alert message
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('limit', '1000');
      if (search) params.append('search', search);
      if (selectedDeptId) {
        params.append('departmentId', selectedDeptId);
        params.append('includeSubDepartments', String(includeSubDepartments));
      }

      const res = await fetch(`${API_BASE_URL}/api/users?${params.toString()}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        if (res.status === 401) {
          setMessage({
            type: 'error',
            text: '인증 세션이 만료되었습니다. 다시 로그인해 주세요.',
          });
          setUsers([]);
          return;
        }
        if (res.status === 403) {
          if (errorData?.error === 'License Required') {
            setMessage({
              type: 'error',
              text: errorData?.message || '유효한 시스템 라이선스가 필요합니다. 라이선스 관리 화면으로 이동합니다.',
            });
            router.replace('/license');
          } else {
            setMessage({
              type: 'error',
              text: errorData?.message || '시스템 관리자 권한이 필요합니다. 먼저 관리자 계정으로 로그인해 주세요.',
            });
          }
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
  }, [token, selectedDeptId, includeSubDepartments]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchUsers();
  };

  const handleDropUsersToDept = async (
    userIds: string[],
    targetDept: { id: string; name: string },
  ) => {
    if (!userIds || userIds.length === 0) return;
    setMessage(null);
    try {
      await Promise.all(
        userIds.map((id) =>
          fetchApi(`/users/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ departmentId: targetDept.id }),
          }),
        ),
      );
      const firstUser = users.find((u) => u.id === userIds[0]);
      const summaryName =
        userIds.length === 1
          ? `'${firstUser?.name || '사용자'}'을(를)`
          : `'${firstUser?.name || '사용자'}' 외 ${userIds.length - 1}명을`;
      setMessage({
        type: 'success',
        text: `${summaryName} '${targetDept.name}' 부서로 이동했습니다.`,
      });
      setSelectedIds([]);
      await Promise.all([fetchUsers(), deptTreeRef.current?.reloadTree()]);
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err?.message || '사용자 부서 이동에 실패했습니다.',
      });
    }
  };

  // Status filter + Pagination calculation
  const filteredUsers = useMemo(() => {
    if (!statusFilter) return users;
    if (statusFilter === 'active') return users.filter((u) => u.isActive);
    if (statusFilter === 'inactive') return users.filter((u) => !u.isActive);
    return users;
  }, [users, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedUsers = filteredUsers.slice(startIndex, startIndex + pageSize);

  const displayStart = filteredUsers.length === 0 ? 0 : startIndex + 1;
  const displayEnd = Math.min(startIndex + pageSize, filteredUsers.length);

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

  // Copy single user's email address to clipboard
  const handleCopyEmail = async (item: UserDto, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(item.email);
      setCopiedUserId(item.id);
      setTimeout(() => {
        setCopiedUserId((prev) => (prev === item.id ? null : prev));
      }, 2000);
    } catch {
      setMessage({ type: 'error', text: '이메일 주소 복사에 실패했습니다.' });
    }
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

  const loadOrgMasterOptions = () => {
    orgApi.getDepartments().then(setDepartments).catch(() => {});
    orgApi.getRanks().then(setOrgRanks).catch(() => {});
    orgApi.getTitles().then(setOrgTitles).catch(() => {});
  };

  // 신규 등록 모달 열기
  const openCreateModal = () => {
    loadAvailableDomains();
    loadOrgMasterOptions();
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
      departmentId: selectedDeptId && selectedDeptId !== 'unassigned' ? selectedDeptId : '',
      position: '',
      jobTitle: '',
      phone: '',
      sendWelcomeMail: true,
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
          mailboxQuotaMb:
            createForm.mailboxQuotaMb !== '' &&
            createForm.mailboxQuotaMb !== undefined &&
            createForm.mailboxQuotaMb !== null &&
            Number.isFinite(Number(createForm.mailboxQuotaMb))
              ? Number(createForm.mailboxQuotaMb)
              : 512,
          preferredLanguage: createForm.preferredLanguage,
          timezone: createForm.timezone,
          employeeId: createForm.employeeId.trim() || undefined,
          departmentId: createForm.departmentId || null,
          position: createForm.position.trim() || null,
          jobTitle: createForm.jobTitle.trim() || null,
          phone: createForm.phone.trim() || null,
          sendWelcomeMail: createForm.sendWelcomeMail,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || '사용자 등록 실패');
      }

      if (createForm.sendWelcomeMail && data.welcomeMailSent === false) {
        setMessage({
          type: 'error',
          text: `사용자 '${data.name} (${data.email})' 등록 및 사서함 생성은 완료되었으나, 환영 메일 발송에 실패했습니다.${data.welcomeMailError ? ` (${data.welcomeMailError})` : ''}`,
        });
      } else {
        setMessage({
          type: 'success',
          text: data.welcomeMailSent
            ? `사용자 '${data.name} (${data.email})' 등록 완료! 전용 사서함 생성 및 환영 메일이 발송되었습니다.`
            : `사용자 '${data.name} (${data.email})' 등록 완료! 전용 사서함이 함께 생성되었습니다.`,
        });
      }
      setIsCreateModalOpen(false);
      fetchUsers();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  // 수정 모달 열기
  const openEditModal = (target: UserDto) => {
    setTargetUser(target);
    loadOrgMasterOptions();
    setEditForm({
      name: target.name,
      role: target.role,
      isActive: target.isActive,
      mailboxQuotaMb: target.mailboxQuotaMb ?? 512,
      preferredLanguage: target.preferredLanguage || 'ko',
      timezone: target.timezone || 'Asia/Seoul',
      employeeId: target.employeeId || '',
      departmentId: target.departmentId || '',
      position: target.position || '',
      jobTitle: target.jobTitle || '',
      phone: target.phone || '',
      employmentStatus: target.employmentStatus || 'ACTIVE',
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
        mailboxQuotaMb:
          editForm.mailboxQuotaMb !== '' &&
          editForm.mailboxQuotaMb !== undefined &&
          editForm.mailboxQuotaMb !== null &&
          Number.isFinite(Number(editForm.mailboxQuotaMb))
            ? Number(editForm.mailboxQuotaMb)
            : 512,
        preferredLanguage: editForm.preferredLanguage,
        timezone: editForm.timezone,
        employeeId: editForm.employeeId.trim() || null,
        departmentId: editForm.departmentId || null,
        position: editForm.position.trim() || null,
        jobTitle: editForm.jobTitle.trim() || null,
        phone: editForm.phone.trim() || null,
        employmentStatus: editForm.employmentStatus,
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
        title="조직 관리"
        icon={<Users className="h-6 w-6 text-sky-600" />}
        subtitle="부서 계층 구조를 구성하고 메일 시스템 접속 계정과 사서함 할당량 등 조직원 프로필을 관리합니다."
        action={
          <div className="flex items-center gap-2 print:hidden">
            <button
              type="button"
              onClick={() => deptTreeRef.current?.openCreateModal()}
              className="btn btn-sm btn-secondary inline-flex items-center gap-1.5 text-xs font-semibold"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              <span>부서 추가</span>
            </button>
            <button
              type="button"
              onClick={openCreateModal}
              className="btn btn-sm btn-primary inline-flex items-center gap-1.5 text-xs font-semibold"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>신규 사용자 등록</span>
            </button>
          </div>
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

      {/* 30% 부서 트리 : 70% 사용자 목록 */}
      <div className="grid grid-cols-1 lg:grid-cols-10 gap-5 items-stretch">
        <div className="lg:col-span-3 print:hidden">
          <DepartmentTreePanel
            ref={deptTreeRef}
            selectedDeptId={selectedDeptId}
            onSelectDept={(deptId, deptName) => {
              setSelectedDeptId(deptId);
              setSelectedDeptName(deptName || '');
            }}
            onDepartmentsChanged={() => {
              fetchUsers();
            }}
            onDropUsersToDept={handleDropUsersToDept}
            onMessage={setMessage}
          />
        </div>

        {/* Main Table Container (70%) */}
        <div className="lg:col-span-7 min-w-0 rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden transition printable-area flex flex-col min-h-[620px]">
          {/* 인쇄 전용 헤더 (인쇄 시 상단에만 노출) */}
          <div className="hidden print:block p-4 border-b-2 border-slate-800">
            <h2 className="text-base font-bold text-slate-900">[LEMail] 사용자 계정 목록</h2>
            <div className="text-xs text-slate-600 mt-1">
              출력일시: {new Date().toLocaleString('ko-KR')} | 목록 {paginatedUsers.length}건
            </div>
          </div>

          {/* 1단 카드 헤더 (좌측 부서 정보 헤더와 동일한 h-12 규격) */}
          <div className="h-12 px-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between gap-2 shrink-0 print:hidden">
            <div className="flex items-center gap-2 min-w-0">
              <Users className="h-4 w-4 text-sky-600 shrink-0" />
              <span className="text-xs font-bold text-slate-900">사용자 목록</span>
              <span className="rounded-full bg-slate-200/70 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 font-mono">
                {filteredUsers.length}
              </span>
              {selectedDeptId && (
                <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 border border-sky-200 truncate">
                  <span className="truncate">{selectedDeptName || '선택 부서'}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDeptId(null);
                      setSelectedDeptName('');
                    }}
                    className="text-sky-500 hover:text-sky-800"
                    title="부서 필터 해제"
                  >
                    ✕
                  </button>
                </span>
              )}
            </div>

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

          {/* 2단 필터/검색 바 (좌측 2단 필터 바와 동일한 h-11 규격) */}
          <div className="h-11 px-4 border-b border-slate-100 flex items-center justify-between gap-3 bg-white shrink-0 print-toolbar print:hidden">
            <div className="flex items-center gap-2">
              <SelectDropdown
                options={[
                  { value: '', label: '전체 상태' },
                  { value: 'active', label: '정상' },
                  { value: 'inactive', label: '제한' },
                ]}
                value={statusFilter}
                onChange={(val) => {
                  setStatusFilter(val);
                  setPage(1);
                }}
                headerLabel="상태 필터"
                size="sm"
                menuWidthClass="w-32"
              />

              <form onSubmit={handleSearchSubmit} className="w-56">
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder="이름 또는 이메일 검색..."
                  size="sm"
                />
              </form>

              <div className="pl-2 border-l border-slate-200 flex items-center gap-2">
                <ToggleSwitch
                  checked={includeSubDepartments}
                  onChange={setIncludeSubDepartments}
                  label="하위 부서 포함"
                  showStatusText={false}
                  size="sm"
                  color="indigo"
                />

                <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDeptId(null);
                      setSelectedDeptName('');
                      setPage(1);
                    }}
                    className={`px-2 py-1 rounded-md font-medium transition-colors ${
                      selectedDeptId === null
                        ? 'bg-white text-sky-700 shadow-2xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    전체
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDeptId('unassigned');
                      setSelectedDeptName('부서 미지정');
                      setPage(1);
                    }}
                    className={`px-2 py-1 rounded-md font-medium transition-colors ${
                      selectedDeptId === 'unassigned'
                        ? 'bg-white text-sky-700 shadow-2xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    미지정
                  </button>
                </div>
              </div>
            </div>

            {selectedIds.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-lg border border-sky-200">
                  {selectedIds.length}명 선택
                </span>
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  className="btn btn-sm btn-secondary text-[11px] font-medium text-rose-600 hover:text-rose-700 border-rose-200 hover:border-rose-300 bg-rose-50/50"
                >
                  선택 삭제
                </button>
              </div>
            )}
          </div>

          {/* 데이터 테이블 */}
          <div className="flex-1 overflow-x-auto">
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
                <th className="px-4 py-3 whitespace-nowrap">이름</th>
                <th className="px-4 py-3 whitespace-nowrap">계정</th>
                <th className="px-4 py-3 whitespace-nowrap">부서</th>
                <th className="px-4 py-3 whitespace-nowrap">직급</th>
                <th className="w-44 px-4 py-3 whitespace-nowrap">메일 용량 (사용량 / 사용률)</th>
                <th className="w-28 px-4 py-3 text-center whitespace-nowrap">언어 / 타임존</th>
                <th className="w-24 px-4 py-3 text-center whitespace-nowrap">상태</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="h-5 w-5 animate-spin text-sky-600" />
                      <span className="font-medium">사용자 목록을 불러오는 중...</span>
                    </div>
                  </td>
                </tr>
              ) : paginatedUsers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-400">
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

                  return (
                    <tr
                      key={item.id}
                      draggable
                      onDragStart={(e) => {
                        const targetIds = selectedIds.includes(item.id)
                          ? selectedIds
                          : [item.id];
                        e.dataTransfer.setData(
                          'application/lemail-user-ids',
                          JSON.stringify(targetIds),
                        );
                        e.dataTransfer.setData('text/plain', item.name);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onClick={() => openEditModal(item)}
                      className={`transition-colors duration-100 hover:bg-slate-50/80 cursor-pointer ${
                        isSelected ? 'bg-sky-50/40' : 'bg-white'
                      }`}
                      title="클릭하여 수정하거나 부서 트리로 드래그하여 부서 이동"
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

                      {/* 이름 */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-700 ring-1 ring-slate-200">
                            {item.name ? item.name.slice(0, 1).toUpperCase() : <User className="h-3.5 w-3.5" />}
                          </div>
                          <div className="flex items-center gap-1.5 min-w-0">
                            <button
                              type="button"
                              onClick={() => openEditModal(item)}
                              className="font-bold text-slate-900 text-xs hover:text-sky-600 transition hover:underline text-left"
                              title="클릭하여 사용자 정보 수정"
                            >
                              {item.name}
                            </button>
                            {item.employmentStatus && item.employmentStatus !== 'ACTIVE' && (
                              <span className="inline-flex items-center rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200">
                                {item.employmentStatus === 'ON_LEAVE' ? '휴직' : '퇴사'}
                              </span>
                            )}
                            {isSelf && (
                              <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 border border-sky-200">
                                본인
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 계정 */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-xs text-slate-600 font-mono">
                          <span>{item.email}</span>
                          <button
                            type="button"
                            onClick={(e) => handleCopyEmail(item, e)}
                            title={copiedUserId === item.id ? '복사됨' : '이메일 주소 복사'}
                            aria-label="이메일 주소 복사"
                            className={`p-1 rounded transition print:hidden ${
                              copiedUserId === item.id
                                ? 'bg-emerald-50 text-emerald-600'
                                : 'text-slate-400 hover:bg-sky-50 hover:text-sky-600'
                            }`}
                          >
                            {copiedUserId === item.id ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* 부서 */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-xs text-slate-700">
                        {item.departmentName ? (
                          <span className="font-medium text-slate-800">{item.departmentName}</span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      {/* 직급 */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-xs text-slate-700">
                        {item.position ? (
                          <span className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                            {item.position}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      {/* 메일 용량 (사용량 & 사용률) */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="flex flex-col gap-1.5 min-w-[140px]">
                          <div className="flex items-center justify-between text-[11px] font-mono">
                            <span className="font-semibold text-slate-800">
                              {item.usedMb ?? 0} <span className="text-slate-400 font-normal">/ {item.mailboxQuotaMb ?? 512} MB</span>
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

                      {/* 상태 */}
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
                          title="상태 클릭 시 정상/제한 토글"
                        >
                          {item.isActive ? (
                            <>
                              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                              <span>정상</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="h-3 w-3 text-slate-400" />
                              <span>제한</span>
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 하단 페이징 및 카운트 바 */}
        <div className="mt-auto shrink-0 px-5 py-3 border-t border-slate-100 bg-slate-50/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-slate-500 print:hidden">
          <div>
            총 <span className="font-semibold text-slate-800">{filteredUsers.length}</span>명 중{' '}
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
                        ? 'bg-sky-600 text-white shadow-sm'
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
      </div>

      {/* Modal: 신규 사용자 등록 (주소록 스타일 그룹핑) */}
      {isCreateModalOpen && (
        <div className="!mt-0 fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-4">
          <div className="w-full max-w-4xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* 고정 헤더 */}
            <div className="flex items-center justify-between px-6 py-4 bg-slate-50/80 border-b border-slate-200/80">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                  <UserPlus className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">신규 사용자 등록</h3>
                  <p className="text-[11px] text-slate-500">
                    등록된 활성 도메인을 기반으로 사용자 계정 및 사서함을 생성합니다.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {availableDomains.length === 0 ? (
              <div className="p-6">
                <div className="rounded-2xl bg-amber-50 border border-amber-200 p-5 text-xs text-amber-800 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-amber-900">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    <span>등록된 활성 도메인이 없습니다</span>
                  </div>
                  <p>사용자를 등록하려면 먼저 메일 서비스 도메인이 등록되어 있어야 합니다.</p>
                  <div className="pt-2 flex items-center gap-2">
                    <Link
                      href="/domains"
                      onClick={() => setIsCreateModalOpen(false)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-amber-700 transition"
                    >
                      <Globe className="h-3.5 w-3.5" />
                      <span>도메인 관리로 이동하여 등록하기</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => setIsCreateModalOpen(false)}
                      className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                    >
                      닫기
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateUser} className="max-h-[calc(88vh-4.5rem)] flex flex-col">
                <div className="p-6 space-y-5 overflow-y-auto flex-1">
                  {/* 상단 프로필 헤더 (아바타 + 이름) */}
                  <div className="flex items-center gap-4 pb-4 border-b border-slate-200/80">
                    <div className="w-12 h-12 rounded-full bg-sky-50 text-sky-600 text-base font-bold flex items-center justify-center shrink-0 ring-1 ring-sky-200/70">
                      {createForm.name.trim() ? createForm.name.trim().slice(0, 1).toUpperCase() : <User className="h-5 w-5" />}
                    </div>
                    <div className="flex-1 max-w-sm">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        이름 <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="예: 김동현"
                        value={createForm.name}
                        onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                        className="h-9 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                      />
                    </div>
                  </div>

                  {/* 2-Column Grouped Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                    {/* 카드 1: 계정 및 보안 */}
                    <div className="rounded-2xl bg-white border border-slate-200">
                      <div className="px-4 py-2.5 bg-slate-50/70 border-b border-slate-200/80 rounded-t-2xl text-[11px] font-semibold text-slate-600">
                        계정 및 보안
                      </div>
                      <div className="divide-y divide-slate-100 text-xs">
                        <div className="px-4 py-3 flex items-start gap-3">
                          <span className="text-slate-500 w-20 shrink-0 pt-2 font-medium">
                            메일 계정 <span className="text-rose-500">*</span>
                          </span>
                          <div className="flex-1 min-w-0 space-y-1.5">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                required
                                placeholder="예: dh.kim"
                                value={createForm.localPart}
                                onChange={(e) =>
                                  setCreateForm({ ...createForm, localPart: e.target.value })
                                }
                                className="h-9 flex-1 min-w-[130px] rounded-xl border border-slate-300 px-2.5 text-xs outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 font-mono"
                              />
                              <span className="text-slate-400 font-bold select-none">@</span>
                              <SelectDropdown
                                options={availableDomains.map((dom) => ({
                                  value: dom.name,
                                  label: `${dom.name}${dom.isDefault ? ' (기본)' : ''}`,
                                }))}
                                value={createForm.selectedDomain}
                                onChange={(val) =>
                                  setCreateForm({ ...createForm, selectedDomain: val })
                                }
                                size="sm"
                                className="w-40 shrink-0"
                              />
                            </div>
                            {createForm.localPart && createForm.selectedDomain && (
                              <div className="text-[11px] text-slate-500 font-mono truncate">
                                <strong className="text-sky-700">
                                  {createForm.localPart.trim().toLowerCase()}@{createForm.selectedDomain}
                                </strong>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="px-4 py-3 flex items-center gap-3">
                          <span className="text-slate-500 w-20 shrink-0 font-medium">
                            비밀번호 <span className="text-rose-500">*</span>
                          </span>
                          <input
                            type="password"
                            required
                            minLength={6}
                            value={createForm.password}
                            onChange={(e) =>
                              setCreateForm({ ...createForm, password: e.target.value })
                            }
                            placeholder="최소 6자 이상"
                            className="h-9 flex-1 min-w-0 rounded-xl border border-slate-300 px-3 text-xs outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                          />
                        </div>

                        <div className="px-4 py-3 flex items-center gap-3">
                          <span className="text-slate-500 w-20 shrink-0 font-medium">환영 메일</span>
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={createForm.sendWelcomeMail}
                              onChange={(e) =>
                                setCreateForm({
                                  ...createForm,
                                  sendWelcomeMail: e.target.checked,
                                })
                              }
                              className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                            />
                            <span className="text-xs text-slate-700">가입 안내 메일 자동 발송</span>
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* 카드 2: 소속 및 인사 정보 */}
                    <div className="rounded-2xl bg-white border border-slate-200">
                      <div className="px-4 py-2.5 bg-slate-50/70 border-b border-slate-200/80 rounded-t-2xl text-[11px] font-semibold text-slate-600">
                        소속 및 인사 정보
                      </div>
                      <div className="divide-y divide-slate-100 text-xs">
                        <div className="px-4 py-2.5 flex items-center gap-3">
                          <span className="text-slate-500 w-20 shrink-0 font-medium">소속 부서</span>
                          <div className="flex-1 min-w-0">
                            <SelectDropdown
                              options={departmentTreeOptions}
                              value={createForm.departmentId}
                              onChange={(val) =>
                                setCreateForm({ ...createForm, departmentId: val })
                              }
                              size="sm"
                              fullWidth
                            />
                          </div>
                        </div>

                        <div className="px-4 py-2.5 flex items-center gap-3">
                          <span className="text-slate-500 w-20 shrink-0 font-medium">직위 (직급)</span>
                          <div className="flex-1 min-w-0">
                            <SelectDropdown
                              options={[
                                { value: '', label: '선택 안함' },
                                ...orgRanks.map((r) => ({
                                  value: r.name,
                                  label: r.name,
                                })),
                              ]}
                              value={createForm.position}
                              onChange={(val) =>
                                setCreateForm({ ...createForm, position: val })
                              }
                              size="sm"
                              fullWidth
                            />
                          </div>
                        </div>

                        <div className="px-4 py-2.5 flex items-center gap-3">
                          <span className="text-slate-500 w-20 shrink-0 font-medium">직책</span>
                          <div className="flex-1 min-w-0">
                            <SelectDropdown
                              options={[
                                { value: '', label: '선택 안함' },
                                ...orgTitles.map((t) => ({
                                  value: t.name,
                                  label: t.name,
                                })),
                              ]}
                              value={createForm.jobTitle}
                              onChange={(val) =>
                                setCreateForm({ ...createForm, jobTitle: val })
                              }
                              size="sm"
                              fullWidth
                            />
                          </div>
                        </div>

                        <div className="px-4 py-2.5 flex items-center gap-3">
                          <span className="text-slate-500 w-20 shrink-0 font-medium">사번</span>
                          <input
                            type="text"
                            placeholder="예: EMP0123"
                            value={createForm.employeeId}
                            onChange={(e) =>
                              setCreateForm({ ...createForm, employeeId: e.target.value })
                            }
                            className="h-9 flex-1 min-w-0 rounded-xl border border-slate-300 px-3 text-xs outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 font-mono"
                          />
                        </div>

                        <div className="px-4 py-2.5 flex items-center gap-3">
                          <span className="text-slate-500 w-20 shrink-0 font-medium">사내 전화</span>
                          <input
                            type="text"
                            placeholder="예: 02-1234-5678"
                            value={createForm.phone}
                            onChange={(e) =>
                              setCreateForm({ ...createForm, phone: e.target.value })
                            }
                            className="h-9 flex-1 min-w-0 rounded-xl border border-slate-300 px-3 text-xs outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 카드 3: 사서함 및 환경 설정 */}
                  <div className="rounded-2xl bg-white border border-slate-200">
                    <div className="px-4 py-2.5 bg-slate-50/70 border-b border-slate-200/80 rounded-t-2xl text-[11px] font-semibold text-slate-600">
                      사서함 및 환경 설정
                    </div>
                    <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                      <div>
                        <label className="block text-slate-500 font-medium mb-1.5">
                          메일 용량 (MB)
                        </label>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            required
                            min={10}
                            step={10}
                            value={createForm.mailboxQuotaMb}
                            onChange={(e) => {
                              const raw = e.target.value;
                              setCreateForm({
                                ...createForm,
                                mailboxQuotaMb: raw === '' ? '' : Number(raw),
                              });
                            }}
                            className="h-9 w-full rounded-xl border border-slate-300 px-3 text-xs outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 font-mono"
                          />
                          <span className="text-slate-500 font-semibold shrink-0">MB</span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-slate-500 font-medium mb-1.5">사용 언어</label>
                        <SelectDropdown
                          options={LANGUAGE_OPTIONS}
                          value={createForm.preferredLanguage}
                          onChange={(val) =>
                            setCreateForm({
                              ...createForm,
                              preferredLanguage: val,
                            })
                          }
                          size="sm"
                          fullWidth
                        />
                      </div>

                      <div>
                        <label className="block text-slate-500 font-medium mb-1.5">타임존</label>
                        <SelectDropdown
                          options={TIMEZONE_OPTIONS}
                          value={createForm.timezone}
                          onChange={(val) =>
                            setCreateForm({ ...createForm, timezone: val })
                          }
                          size="sm"
                          fullWidth
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 고정 푸터 */}
                <div className="px-6 py-3.5 bg-slate-50/80 border-t border-slate-200/80 flex justify-end gap-2 shrink-0">
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

      {/* Modal: 사용자 정보 수정 (주소록 스타일 그룹핑) */}
      {isEditModalOpen && targetUser && (
        <div className="!mt-0 fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-4">
          <div className="w-full max-w-4xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* 고정 헤더 */}
            <div className="flex items-center justify-between px-6 py-4 bg-slate-50/80 border-b border-slate-200/80">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                  <Pencil className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">사용자 정보 수정</h3>
                  <p className="text-[11px] text-slate-500">
                    사용자 프로필, 소속 및 사서함 환경 설정 정보를 수정합니다.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateUser} className="max-h-[calc(88vh-4.5rem)] flex flex-col">
              <div className="p-6 space-y-5 overflow-y-auto flex-1">
                {/* 상단 프로필 헤더 (아바타 + 이름 + 계정 배지) */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="w-12 h-12 rounded-full bg-sky-50 text-sky-600 text-base font-bold flex items-center justify-center shrink-0 ring-1 ring-sky-200/70">
                      {editForm.name.trim() ? editForm.name.trim().slice(0, 1).toUpperCase() : <User className="h-5 w-5" />}
                    </div>
                    <div className="flex-1 max-w-sm">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        이름 <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="h-9 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                      />
                    </div>
                  </div>
                  <div className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-mono text-slate-600 self-start sm:self-end">
                    <Mail className="h-3.5 w-3.5 text-slate-400" />
                    <span>{targetUser.email}</span>
                  </div>
                </div>

                {/* 2-Column Grouped Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                  {/* 카드 1: 계정 및 보안 */}
                  <div className="rounded-2xl bg-white border border-slate-200">
                    <div className="px-4 py-2.5 bg-slate-50/70 border-b border-slate-200/80 rounded-t-2xl text-[11px] font-semibold text-slate-600">
                      계정 및 보안
                    </div>
                    <div className="divide-y divide-slate-100 text-xs">
                      <div className="px-4 py-3 flex items-center gap-3">
                        <span className="text-slate-500 w-20 shrink-0 font-medium">메일 계정</span>
                        <div className="flex-1 min-w-0 flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-600">
                          <span className="truncate">{targetUser.email}</span>
                          <span className="shrink-0 text-[10px] text-slate-400">고정</span>
                        </div>
                      </div>

                      <div className="px-4 py-3 flex items-start gap-3">
                        <span className="text-slate-500 w-20 shrink-0 pt-2 font-medium">비밀번호</span>
                        <div className="flex-1 min-w-0 space-y-1">
                          <input
                            type="password"
                            minLength={6}
                            placeholder="변경 시에만 입력 (최소 6자)"
                            value={editForm.password || ''}
                            onChange={(e) =>
                              setEditForm({ ...editForm, password: e.target.value })
                            }
                            className="h-9 w-full rounded-xl border border-slate-300 px-3 text-xs outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                          />
                          <span className="text-[10px] text-slate-400 block">
                            기존 비밀번호 유지 시 빈칸으로 두세요.
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 카드 2: 소속 및 인사 정보 */}
                  <div className="rounded-2xl bg-white border border-slate-200">
                    <div className="px-4 py-2.5 bg-slate-50/70 border-b border-slate-200/80 rounded-t-2xl text-[11px] font-semibold text-slate-600">
                      소속 및 인사 정보
                    </div>
                    <div className="divide-y divide-slate-100 text-xs">
                      <div className="px-4 py-2.5 flex items-center gap-3">
                        <span className="text-slate-500 w-20 shrink-0 font-medium">소속 부서</span>
                        <div className="flex-1 min-w-0">
                          <SelectDropdown
                            options={departmentTreeOptions}
                            value={editForm.departmentId}
                            onChange={(val) =>
                              setEditForm({ ...editForm, departmentId: val })
                            }
                            size="sm"
                            fullWidth
                          />
                        </div>
                      </div>

                      <div className="px-4 py-2.5 flex items-center gap-3">
                        <span className="text-slate-500 w-20 shrink-0 font-medium">직위 (직급)</span>
                        <div className="flex-1 min-w-0">
                          <SelectDropdown
                            options={[
                              { value: '', label: '선택 안함' },
                              ...(editForm.position &&
                              !orgRanks.some((r) => r.name === editForm.position)
                                ? [{ value: editForm.position, label: `${editForm.position} (기존 값)` }]
                                : []),
                              ...orgRanks.map((r) => ({
                                value: r.name,
                                label: r.name,
                              })),
                            ]}
                            value={editForm.position}
                            onChange={(val) =>
                              setEditForm({ ...editForm, position: val })
                            }
                            size="sm"
                            fullWidth
                          />
                        </div>
                      </div>

                      <div className="px-4 py-2.5 flex items-center gap-3">
                        <span className="text-slate-500 w-20 shrink-0 font-medium">직책</span>
                        <div className="flex-1 min-w-0">
                          <SelectDropdown
                            options={[
                              { value: '', label: '선택 안함' },
                              ...(editForm.jobTitle &&
                              !orgTitles.some((t) => t.name === editForm.jobTitle)
                                ? [{ value: editForm.jobTitle, label: `${editForm.jobTitle} (기존 값)` }]
                                : []),
                              ...orgTitles.map((t) => ({
                                value: t.name,
                                label: t.name,
                              })),
                            ]}
                            value={editForm.jobTitle}
                            onChange={(val) =>
                              setEditForm({ ...editForm, jobTitle: val })
                            }
                            size="sm"
                            fullWidth
                          />
                        </div>
                      </div>

                      <div className="px-4 py-2.5 flex items-center gap-3">
                        <span className="text-slate-500 w-20 shrink-0 font-medium">사번</span>
                        <input
                          type="text"
                          placeholder="예: EMP0123"
                          value={editForm.employeeId}
                          onChange={(e) =>
                            setEditForm({ ...editForm, employeeId: e.target.value })
                          }
                          className="h-9 flex-1 min-w-0 rounded-xl border border-slate-300 px-3 text-xs outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 font-mono"
                        />
                      </div>

                      <div className="px-4 py-2.5 flex items-center gap-3">
                        <span className="text-slate-500 w-20 shrink-0 font-medium">사내 전화</span>
                        <input
                          type="text"
                          placeholder="예: 02-1234-5678"
                          value={editForm.phone}
                          onChange={(e) =>
                            setEditForm({ ...editForm, phone: e.target.value })
                          }
                          className="h-9 flex-1 min-w-0 rounded-xl border border-slate-300 px-3 text-xs outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                        />
                      </div>

                      <div className="px-4 py-2.5 flex items-center gap-3">
                        <span className="text-slate-500 w-20 shrink-0 font-medium">재직 상태</span>
                        <div className="flex-1 min-w-0">
                          <SelectDropdown
                            options={[
                              { value: 'ACTIVE', label: '재직 (ACTIVE)' },
                              { value: 'ON_LEAVE', label: '휴직 (ON_LEAVE)' },
                              { value: 'RESIGNED', label: '퇴사 (RESIGNED)' },
                            ]}
                            value={editForm.employmentStatus}
                            onChange={(val) =>
                              setEditForm({ ...editForm, employmentStatus: val as EmploymentStatus })
                            }
                            size="sm"
                            fullWidth
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 카드 3: 사서함 및 환경 설정 */}
                <div className="rounded-2xl bg-white border border-slate-200">
                  {(() => {
                    const usedMb = targetUser.usedMb ?? 0;
                    const quotaMb = Math.max(1, Number(editForm.mailboxQuotaMb) || targetUser.mailboxQuotaMb || 512);
                    const livePercent = Math.round((usedMb / quotaMb) * 100);
                    const isExceeded = usedMb > quotaMb;
                    const barColor =
                      isExceeded || livePercent >= 90
                        ? 'bg-rose-500'
                        : livePercent >= 70
                        ? 'bg-amber-500'
                        : 'bg-sky-500';
                    return (
                      <div className="px-4 py-2.5 bg-slate-50/70 border-b border-slate-200/80 rounded-t-2xl text-[11px] font-semibold text-slate-600 flex flex-wrap items-center justify-between gap-3">
                        <span>사서함 및 환경 설정</span>
                        <div className="flex items-center gap-2 font-mono">
                          <span className={isExceeded ? 'text-rose-600 font-bold' : 'font-normal text-slate-600'}>
                            현재 사용량: {usedMb} MB
                          </span>
                          <div className="w-24 h-1.5 bg-slate-200/80 rounded-full overflow-hidden border border-slate-200/60">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                              style={{
                                width: `${Math.min(100, Math.max(usedMb > 0 ? 2 : 0, livePercent))}%`,
                              }}
                            />
                          </div>
                          <span
                            className={
                              isExceeded
                                ? 'text-rose-600 font-bold'
                                : livePercent >= 90
                                ? 'text-rose-600 font-semibold'
                                : livePercent >= 70
                                ? 'text-amber-600 font-semibold'
                                : 'text-sky-600 font-semibold'
                            }
                          >
                            {livePercent}%
                          </span>
                          <span className="font-normal text-slate-500">
                            / {quotaMb} MB, {targetUser.messageCount ?? 0}통
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                  <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                    <div>
                      <label className="block text-slate-500 font-medium mb-1.5">
                        메일 용량 (MB)
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          required
                          min={10}
                          step={10}
                          value={editForm.mailboxQuotaMb}
                          onChange={(e) => {
                            const raw = e.target.value;
                            setEditForm({
                              ...editForm,
                              mailboxQuotaMb: raw === '' ? '' : Number(raw),
                            });
                          }}
                          className="h-9 w-full rounded-xl border border-slate-300 px-3 text-xs outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 font-mono"
                        />
                        <span className="text-slate-500 font-semibold shrink-0">MB</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-slate-500 font-medium mb-1.5">사용 언어</label>
                      <SelectDropdown
                        options={LANGUAGE_OPTIONS}
                        value={editForm.preferredLanguage}
                        onChange={(val) =>
                          setEditForm({
                            ...editForm,
                            preferredLanguage: val,
                          })
                        }
                        size="sm"
                        fullWidth
                      />
                    </div>

                    <div>
                      <label className="block text-slate-500 font-medium mb-1.5">타임존</label>
                      <SelectDropdown
                        options={TIMEZONE_OPTIONS}
                        value={editForm.timezone}
                        onChange={(val) =>
                          setEditForm({ ...editForm, timezone: val })
                        }
                        size="sm"
                        fullWidth
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 고정 푸터 */}
              <div className="px-6 py-3.5 bg-slate-50/80 border-t border-slate-200/80 flex justify-end gap-2 shrink-0">
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
