'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { fetchApi } from '@/lib/api';
import { MailboxDto, DomainDto } from '@lemail/shared-types';
import {
  Mail,
  Plus,
  Search,
  Trash2,
  Check,
  X,
  RefreshCw,
  Copy,
  FileSpreadsheet,
  Printer,
  ChevronLeft,
  ChevronRight,
  Globe,
  CheckCircle2,
  XCircle,
  Inbox,
  AlertCircle,
} from 'lucide-react';

export default function MailboxesPage() {
  const [mailboxes, setMailboxes] = useState<MailboxDto[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled'>('all');
  const [loading, setLoading] = useState(true);

  // Selection & Pagination
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // 모달 상태
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [availableDomains, setAvailableDomains] = useState<DomainDto[]>([]);
  const [newLocalPart, setNewLocalPart] = useState('');
  const [selectedDomain, setSelectedDomain] = useState('');
  const [creating, setCreating] = useState(false);

  const loadMailboxes = async () => {
    try {
      setLoading(true);
      const res = await fetchApi<{ items: MailboxDto[]; total: number }>(
        `/mailboxes?search=${encodeURIComponent(search)}&limit=100`,
      );
      setMailboxes(res.items || []);
      setTotal(res.total || 0);
      setSelectedIds([]);
      setPage(1);
    } catch (err: any) {
      alert(err.message || '사서함 목록 조회 실패');
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
        setSelectedDomain(defaultDom.name);
      }
    } catch (err) {
      console.error('Failed to load active domains', err);
    }
  };

  useEffect(() => {
    loadMailboxes();
  }, [search]);

  const openCreateModal = () => {
    loadAvailableDomains();
    setNewLocalPart('');
    setIsModalOpen(true);
  };

  // 필터링 적용
  const filteredMailboxes = useMemo(() => {
    if (statusFilter === 'all') return mailboxes;
    if (statusFilter === 'active') return mailboxes.filter((m) => m.isActive);
    if (statusFilter === 'disabled') return mailboxes.filter((m) => !m.isActive);
    return mailboxes;
  }, [mailboxes, statusFilter]);

  // 페이징 계산
  const totalPages = Math.max(1, Math.ceil(filteredMailboxes.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedMailboxes = filteredMailboxes.slice(startIndex, startIndex + pageSize);

  const displayStart = filteredMailboxes.length === 0 ? 0 : startIndex + 1;
  const displayEnd = Math.min(startIndex + pageSize, filteredMailboxes.length);

  // 선택 핸들러
  const allCurrentSelected =
    paginatedMailboxes.length > 0 &&
    paginatedMailboxes.every((m) => selectedIds.includes(m.id));

  const handleSelectAll = () => {
    if (allCurrentSelected) {
      setSelectedIds((prev) =>
        prev.filter((id) => !paginatedMailboxes.some((m) => m.id === id))
      );
    } else {
      const toAdd = paginatedMailboxes.map((m) => m.id);
      setSelectedIds((prev) => Array.from(new Set([...prev, ...toAdd])));
    }
  };

  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // 클립보드 복사
  const handleCopy = async () => {
    const targets =
      selectedIds.length > 0
        ? filteredMailboxes.filter((m) => selectedIds.includes(m.id))
        : paginatedMailboxes;

    if (targets.length === 0) return;

    const header = ['등록일자', '이메일 주소', '도메인', '상태'].join('\t');
    const rows = targets.map((m) => {
      const created = new Date(m.createdAt).toISOString().slice(0, 10);
      const status = m.isActive ? 'Active (수신 허용)' : 'Disabled (차단)';
      return [created, m.email, m.domain, status].join('\t');
    });

    const text = [header, ...rows].join('\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 엑셀 내보내기 (CSV UTF-8 BOM)
  const handleExcelExport = () => {
    const targets =
      selectedIds.length > 0
        ? filteredMailboxes.filter((m) => selectedIds.includes(m.id))
        : filteredMailboxes;

    if (targets.length === 0) {
      alert('내보낼 사서함 데이터가 없습니다.');
      return;
    }

    const header = ['등록일자', '이메일 주소', '도메인', '상태'];
    const escapeCsv = (val: string) => `"${(val || '').replace(/"/g, '""')}"`;

    const rows = targets.map((m) => {
      const created = new Date(m.createdAt).toISOString().slice(0, 10);
      const status = m.isActive ? 'Active (수신 허용)' : 'Disabled (차단)';
      return [
        escapeCsv(created),
        escapeCsv(m.email),
        escapeCsv(m.domain),
        escapeCsv(status),
      ].join(',');
    });

    const csvContent = '\uFEFF' + [header.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const today = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.setAttribute('download', `LEMail_Mailboxes_${today}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 인쇄
  const handlePrint = () => {
    window.print();
  };

  const handleToggleActive = async (mailbox: MailboxDto) => {
    try {
      await fetchApi(`/mailboxes/${mailbox.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !mailbox.isActive }),
      });
      loadMailboxes();
    } catch (err: any) {
      alert(err.message || '상태 변경 실패');
    }
  };

  const handleDelete = async (id: string, email: string) => {
    if (!confirm(`사서함 '${email}'을 정말 삭제하시겠습니까?`)) return;
    try {
      await fetchApi(`/mailboxes/${id}`, { method: 'DELETE' });
      loadMailboxes();
    } catch (err: any) {
      alert(err.message || '삭제 실패');
    }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`선택한 ${selectedIds.length}개의 사서함을 삭제하시겠습니까?`)) return;
    try {
      await Promise.all(
        selectedIds.map((id) => fetchApi(`/mailboxes/${id}`, { method: 'DELETE' }))
      );
      loadMailboxes();
    } catch (err: any) {
      alert(err.message || '일괄 삭제 중 오류가 발생했습니다.');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const local = newLocalPart.trim();
    if (!local) {
      alert('사서함 계정 아이디를 입력해 주세요.');
      return;
    }
    if (!selectedDomain) {
      alert('도메인을 선택해 주세요.');
      return;
    }

    const fullEmail = `${local}@${selectedDomain}`.toLowerCase();

    try {
      setCreating(true);
      await fetchApi('/mailboxes', {
        method: 'POST',
        body: JSON.stringify({
          email: fullEmail,
          domain: selectedDomain,
        }),
      });
      setIsModalOpen(false);
      setNewLocalPart('');
      loadMailboxes();
    } catch (err: any) {
      alert(err.message || '사서함 생성 실패');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Mail className="h-6 w-6 text-sky-600" />
            <span>사서함 관리</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            등록된 도메인의 사용자 사서함을 등록하고 인바운드 수신 상태를 관리합니다.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 transition active:scale-95 self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          <span>신규 사서함 등록</span>
        </button>
      </div>

      {/* Main Table Container (편지함 목록 형식과 동일) */}
      <div className="rounded-2xl border border-slate-200/90 bg-white shadow-sm overflow-hidden transition">
        {/* 상단 툴바: 검색창 + 상태 필터 (좌) / 일괄 작업 + Copy / Excel / Print / 새로고침 (우) */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white">
          {/* 좌측: 검색창 및 상태 필터 */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:max-w-md">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="이메일 또는 도메인 검색..."
                className="h-9 w-full rounded-xl border border-slate-200/90 bg-slate-50/70 pl-9 pr-4 text-xs font-normal outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:bg-white focus:ring-2 focus:ring-sky-100"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="h-9 rounded-xl border border-slate-200/90 bg-slate-50/70 px-3 text-xs text-slate-700 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-2 focus:ring-sky-100"
            >
              <option value="all">모든 상태</option>
              <option value="active">Active (수신 허용)</option>
              <option value="disabled">Disabled (차단)</option>
            </select>
          </div>

          {/* 우측: 유틸리티 버튼군 */}
          <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
            {/* 다중 선택 일괄 액션 */}
            {selectedIds.length > 0 && (
              <div className="flex items-center gap-1.5 mr-2 pr-2 border-r border-slate-200">
                <span className="text-xs font-semibold text-sky-600 bg-sky-50 px-2 py-0.5 rounded-lg border border-sky-200">
                  {selectedIds.length}개 선택
                </span>
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-medium text-rose-700 shadow-sm hover:bg-rose-100 transition"
                >
                  선택 삭제
                </button>
              </div>
            )}

            {/* Copy 버튼 */}
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:border-slate-300 active:scale-95"
              title="현재 목록 클립보드 복사"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="text-emerald-700 font-bold">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 text-slate-500" />
                  <span>Copy</span>
                </>
              )}
            </button>

            {/* Excel 버튼 */}
            <button
              type="button"
              onClick={handleExcelExport}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:border-slate-300 active:scale-95"
              title="CSV/Excel 파일로 다운로드"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
              <span>Excel</span>
            </button>

            {/* Print 버튼 */}
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:border-slate-300 active:scale-95"
              title="인쇄 미리보기"
            >
              <Printer className="h-3.5 w-3.5 text-slate-500" />
              <span>Print</span>
            </button>

            {/* 새로고침 버튼 */}
            <button
              type="button"
              onClick={loadMailboxes}
              title="새로고침"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:border-slate-300 active:scale-95"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* 데이터 테이블 */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            {/* 테이블 헤더 */}
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/60 text-slate-600 font-semibold select-none">
                <th className="w-10 px-4 py-3.5 text-center">
                  <input
                    type="checkbox"
                    checked={allCurrentSelected}
                    onChange={handleSelectAll}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                    title="전체 선택"
                  />
                </th>
                <th className="w-28 px-4 py-3.5 whitespace-nowrap">등록일자</th>
                <th className="px-4 py-3.5 whitespace-nowrap">사서함 계정 정보</th>
                <th className="w-48 px-4 py-3.5 whitespace-nowrap">소속 도메인</th>
                <th className="w-40 px-4 py-3.5 text-center whitespace-nowrap">수신 상태</th>
                <th className="w-20 px-4 py-3.5 text-right whitespace-nowrap">관리</th>
              </tr>
            </thead>

            {/* 테이블 본문 */}
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="h-5 w-5 animate-spin text-sky-600" />
                      <span className="font-medium">사서함 목록을 불러오는 중...</span>
                    </div>
                  </td>
                </tr>
              ) : paginatedMailboxes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center">
                      <Inbox className="h-10 w-10 text-slate-300 mb-2 stroke-1" />
                      <p className="font-semibold text-slate-600 text-sm">등록된 사서함이 없습니다.</p>
                      <p className="text-xs text-slate-400 mt-1">상단의 '신규 사서함 등록' 버튼을 눌러 추가하세요.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedMailboxes.map((mb) => {
                  const isSelected = selectedIds.includes(mb.id);
                  const createdDate = new Date(mb.createdAt).toISOString().slice(0, 10);
                  const userLocal = mb.email.split('@')[0] || mb.email;

                  return (
                    <tr
                      key={mb.id}
                      className={`transition-colors duration-100 hover:bg-slate-50/80 ${
                        isSelected ? 'bg-sky-50/40' : 'bg-white'
                      }`}
                    >
                      {/* 선택 체크박스 */}
                      <td
                        className="px-4 py-3.5 text-center"
                        onClick={(e) => handleToggleSelect(mb.id, e)}
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

                      {/* 사서함 계정 정보 (아이콘 + 이메일) */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sky-600 ring-1 ring-sky-100">
                            <Mail className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 truncate max-w-sm">
                              {mb.email}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              계정명: {userLocal}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 소속 도메인 */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-slate-600">
                          <Globe className="h-3.5 w-3.5 text-slate-400" />
                          <span className="font-mono text-xs">{mb.domain}</span>
                        </div>
                      </td>

                      {/* 수신 상태 (토글 버튼) */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleToggleActive(mb)}
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition ${
                            mb.isActive
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                              : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'
                          }`}
                          title="상태 클릭 시 활성/비활성 토글"
                        >
                          {mb.isActive ? (
                            <>
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                              <span>Active (수신 허용)</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="h-3.5 w-3.5 text-slate-400" />
                              <span>Disabled (차단)</span>
                            </>
                          )}
                        </button>
                      </td>

                      {/* 관리 액션 */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleDelete(mb.id, mb.email)}
                          className="p-1 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                          title="사서함 삭제"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
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
        <div className="px-5 py-3.5 border-t border-slate-100 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-slate-500">
          <div>
            총 <span className="font-semibold text-slate-800">{filteredMailboxes.length}</span>건 중{' '}
            <span className="font-semibold text-slate-800">
              {displayStart} - {displayEnd}
            </span>
            건 표시
          </div>

          {paginatedMailboxes.length > 0 && (
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

      {/* Modal: 신규 사서함 등록 */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2">
              <Mail className="h-5 w-5 text-sky-600" />
              <span>신규 사서함 등록</span>
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              등록된 사서함은 즉시 인메모리/Redis 캐시에 동기화되어 메일 수신이 허용됩니다.
            </p>

            {availableDomains.length === 0 ? (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-xs text-amber-800 space-y-2">
                <div className="flex items-center gap-2 font-bold text-amber-900">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <span>등록된 활성 도메인이 없습니다</span>
                </div>
                <p>
                  사서함을 생성하려면 먼저 메일 서비스 도메인이 등록되어 있어야 합니다.
                </p>
                <div className="pt-2">
                  <Link
                    href="/admin/domains"
                    onClick={() => setIsModalOpen(false)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-700 transition"
                  >
                    <Globe className="h-3.5 w-3.5" />
                    <span>도메인 관리로 이동하여 등록하기</span>
                  </Link>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    사서함 이메일 주소
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      required
                      placeholder="계정 아이디 (예: john)"
                      value={newLocalPart}
                      onChange={(e) => setNewLocalPart(e.target.value)}
                      className="h-10 flex-1 rounded-xl border border-slate-300 px-3 text-xs outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 font-mono"
                    />
                    <span className="text-slate-400 font-bold text-sm select-none">@</span>
                    <select
                      value={selectedDomain}
                      onChange={(e) => setSelectedDomain(e.target.value)}
                      className="h-10 rounded-xl border border-slate-300 px-3 text-xs outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 bg-white font-mono min-w-[130px]"
                    >
                      {availableDomains.map((dom) => (
                        <option key={dom.id} value={dom.name}>
                          {dom.name} {dom.isDefault ? '(기본)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  {newLocalPart && selectedDomain && (
                    <div className="mt-2 text-[11px] text-slate-500 font-mono">
                      완성 주소: <strong className="text-sky-700">{newLocalPart.trim().toLowerCase()}@{selectedDomain}</strong>
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500 transition disabled:opacity-50"
                  >
                    {creating ? '등록 중...' : '등록하기'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
