'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { fetchApi } from '@/lib/api';
import { DomainDto } from '@lemail/shared-types';
import { PageHeader, SearchInput, TableUtilityButtons } from '@/components/common';
import {
  Globe,
  Plus,
  Search,
  Trash2,
  Check,
  RefreshCw,
  Copy,
  FileSpreadsheet,
  Printer,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Star,
  Layers,
  HelpCircle,
  ExternalLink,
  ShieldCheck,
  Info,
  Activity,
  AlertCircle,
} from 'lucide-react';

export default function DomainsPage() {
  const [domains, setDomains] = useState<DomainDto[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled'>('all');
  const [loading, setLoading] = useState(true);

  // Selection & Pagination
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // 도메인 생성 모달
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [creating, setCreating] = useState(false);

  // DNS 가이드 모달
  const [selectedDomainForDns, setSelectedDomainForDns] = useState<DomainDto | null>(null);
  const [dkimInfo, setDkimInfo] = useState<{
    hasKey: boolean;
    selector?: string;
    dnsHostRecord?: string;
    dnsTxtRecord?: string;
  } | null>(null);
  const [generatingDkim, setGeneratingDkim] = useState(false);

  useEffect(() => {
    if (selectedDomainForDns) {
      setDkimInfo(null);
      fetchApi(`/domains/${selectedDomainForDns.id}/dkim`)
        .then((res: any) => setDkimInfo(res))
        .catch(() => setDkimInfo({ hasKey: false }));
    }
  }, [selectedDomainForDns]);

  const handleGenerateDkim = async () => {
    if (!selectedDomainForDns) return;
    try {
      setGeneratingDkim(true);
      const res: any = await fetchApi(`/domains/${selectedDomainForDns.id}/generate-dkim`, {
        method: 'POST',
      });
      setDkimInfo({
        hasKey: true,
        selector: res.selector,
        dnsHostRecord: res.dnsHostRecord,
        dnsTxtRecord: res.dnsTxtRecord,
      });
      alert('DKIM 키 쌍이 안전하게 생성되었습니다. 표시된 DNS TXT 레코드를 도메인 네임서버에 등록해 주세요.');
    } catch (err: any) {
      alert(err.message || 'DKIM 키 생성 실패');
    } finally {
      setGeneratingDkim(false);
    }
  };

  // 도메인 보안 진단 모달
  const [selectedDomainForHealth, setSelectedDomainForHealth] = useState<DomainDto | null>(null);
  const [healthReport, setHealthReport] = useState<any>(null);
  const [loadingHealth, setLoadingHealth] = useState(false);

  const runHealthCheck = async (domain: DomainDto) => {
    setSelectedDomainForHealth(domain);
    setHealthReport(null);
    setLoadingHealth(true);
    try {
      const res: any = await fetchApi(`/domains/${domain.id}/health-check`);
      setHealthReport(res);
    } catch (err: any) {
      alert(err.message || '보안 진단 실패');
    } finally {
      setLoadingHealth(false);
    }
  };

  const loadDomains = async () => {
    try {
      setLoading(true);
      const res = await fetchApi<{ items: DomainDto[]; total: number }>(
        `/domains?search=${encodeURIComponent(search)}&limit=100`,
      );
      setDomains(res.items || []);
      setTotal(res.total || 0);
      setSelectedIds([]);
      setPage(1);
    } catch (err: any) {
      alert(err.message || '도메인 목록 조회 실패');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDomains();
  }, [search]);

  // 필터링 적용
  const filteredDomains = useMemo(() => {
    if (statusFilter === 'all') return domains;
    if (statusFilter === 'active') return domains.filter((d) => d.isActive);
    if (statusFilter === 'disabled') return domains.filter((d) => !d.isActive);
    return domains;
  }, [domains, statusFilter]);

  // 페이징 계산
  const totalPages = Math.max(1, Math.ceil(filteredDomains.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedDomains = filteredDomains.slice(startIndex, startIndex + pageSize);

  const displayStart = filteredDomains.length === 0 ? 0 : startIndex + 1;
  const displayEnd = Math.min(startIndex + pageSize, filteredDomains.length);

  // 선택 핸들러
  const allCurrentSelected =
    paginatedDomains.length > 0 &&
    paginatedDomains.every((d) => selectedIds.includes(d.id));

  const handleSelectAll = () => {
    if (allCurrentSelected) {
      setSelectedIds((prev) =>
        prev.filter((id) => !paginatedDomains.some((d) => d.id === id))
      );
    } else {
      const toAdd = paginatedDomains.map((d) => d.id);
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
        ? filteredDomains.filter((d) => selectedIds.includes(d.id))
        : paginatedDomains;

    if (targets.length === 0) return;

    const header = ['등록일자', '도메인명', '기본여부', '등록 사서함수', '설명', '상태'].join('\t');
    const rows = targets.map((d) => {
      const created = new Date(d.createdAt).toISOString().slice(0, 10);
      const isDef = d.isDefault ? '대표 도메인' : '일반 도메인';
      const status = d.isActive ? 'Active (수신 허용)' : 'Disabled (차단)';
      return [created, d.name, isDef, d.mailboxCount ?? 0, d.description || '-', status].join('\t');
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
        ? filteredDomains.filter((d) => selectedIds.includes(d.id))
        : filteredDomains;

    if (targets.length === 0) {
      alert('내보낼 도메인 데이터가 없습니다.');
      return;
    }

    const header = ['등록일자', '도메인명', '기본여부', '등록 사서함수', '설명', '상태'];
    const escapeCsv = (val: string) => `"${(val || '').replace(/"/g, '""')}"`;

    const rows = targets.map((d) => {
      const created = new Date(d.createdAt).toISOString().slice(0, 10);
      const isDef = d.isDefault ? '대표 도메인' : '일반 도메인';
      const status = d.isActive ? 'Active (수신 허용)' : 'Disabled (차단)';
      return [
        escapeCsv(created),
        escapeCsv(d.name),
        escapeCsv(isDef),
        escapeCsv(String(d.mailboxCount ?? 0)),
        escapeCsv(d.description || '-'),
        escapeCsv(status),
      ].join(',');
    });

    const csvContent = '\uFEFF' + [header.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const today = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.setAttribute('download', `LEMail_Domains_${today}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 인쇄
  const handlePrint = () => {
    window.print();
  };

  // 상태 토글
  const handleToggleActive = async (domain: DomainDto) => {
    try {
      await fetchApi(`/domains/${domain.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !domain.isActive }),
      });
      loadDomains();
    } catch (err: any) {
      alert(err.message || '상태 변경 실패');
    }
  };

  // 기본 대표 도메인 설정
  const handleSetDefault = async (domain: DomainDto) => {
    if (domain.isDefault) return;
    if (!confirm(`'${domain.name}'을 시스템 기본 대표 도메인으로 설정하시겠습니까?`)) return;

    try {
      await fetchApi(`/domains/${domain.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isDefault: true }),
      });
      loadDomains();
    } catch (err: any) {
      alert(err.message || '기본 도메인 설정 실패');
    }
  };

  // 도메인 삭제
  const handleDelete = async (domain: DomainDto) => {
    if (domain.isDefault) {
      alert('기본 대표 도메인은 삭제할 수 없습니다.');
      return;
    }

    if (!confirm(`도메인 '${domain.name}'을 정말 삭제하시겠습니까?`)) return;

    try {
      await fetchApi(`/domains/${domain.id}`, { method: 'DELETE' });
      loadDomains();
    } catch (err: any) {
      alert(err.message || '도메인 삭제 실패');
    }
  };

  // 신규 도메인 생성
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newName.toLowerCase().trim();

    if (!cleanName.includes('.')) {
      alert('올바른 도메인 형식을 입력해 주세요 (예: mycompany.com).');
      return;
    }

    try {
      setCreating(true);
      await fetchApi('/domains', {
        method: 'POST',
        body: JSON.stringify({
          name: cleanName,
          description: newDesc.trim() || undefined,
          isDefault,
        }),
      });
      setIsModalOpen(false);
      setNewName('');
      setNewDesc('');
      setIsDefault(false);
      loadDomains();
    } catch (err: any) {
      alert(err.message || '도메인 생성 실패');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <PageHeader
        title="도메인 관리"
        icon={<Globe className="h-6 w-6 text-sky-600" />}
        subtitle="메일 수신 및 발송에 사용할 서비스 도메인을 등록하고 DNS 연동 상태를 관리합니다."
        action={
          <button
            onClick={() => setIsModalOpen(true)}
            className="btn btn-sm btn-primary inline-flex items-center gap-1.5 text-xs font-semibold"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>신규 도메인 등록</span>
          </button>
        }
      />

      {/* Main Table Container */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden transition printable-area">
        {/* 상단 툴바: 상태 필터 -> 검색창 / 버튼군 */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white print-toolbar">
          {/* 좌측: [상태 필터] -> [검색창] (ams 표준 순서 준수) */}
          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none transition focus:border-sky-500 shadow-xs"
            >
              <option value="all">모든 상태</option>
              <option value="active">Active (수신 허용)</option>
              <option value="disabled">Disabled (차단)</option>
            </select>

            <div className="w-60">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="도메인명 또는 설명 검색..."
                size="md"
              />
            </div>
          </div>

          {/* 우측: 유틸리티 버튼군 */}
          <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
            <TableUtilityButtons
              onCopy={handleCopy}
              onExcel={handleExcelExport}
              onPrint={handlePrint}
              copied={copied}
              extraActions={
                <button
                  type="button"
                  onClick={loadDomains}
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
            {/* 테이블 헤더 */}
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50 text-slate-600 font-medium select-none">
                <th className="w-10 px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={allCurrentSelected}
                    onChange={handleSelectAll}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                    title="전체 선택"
                  />
                </th>
                <th className="w-28 px-4 py-3 whitespace-nowrap">등록일자</th>
                <th className="px-4 py-3 whitespace-nowrap">도메인 정보</th>
                <th className="w-32 px-4 py-3 text-center whitespace-nowrap">연동 사서함</th>
                <th className="w-32 px-4 py-3 text-center whitespace-nowrap">DNS 설정</th>
                <th className="w-36 px-4 py-3 text-center whitespace-nowrap">수신 상태</th>
                <th className="w-24 px-4 py-3 text-right whitespace-nowrap">관리</th>
              </tr>
            </thead>

            {/* 테이블 본문 */}
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="h-5 w-5 animate-spin text-indigo-600" />
                      <span className="font-medium">도메인 목록을 불러오는 중...</span>
                    </div>
                  </td>
                </tr>
              ) : paginatedDomains.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center">
                      <Globe className="h-10 w-10 text-slate-300 mb-2 stroke-1" />
                      <p className="font-semibold text-slate-600 text-sm">등록된 도메인이 없습니다.</p>
                      <p className="text-xs text-slate-400 mt-1">상단의 '신규 도메인 등록' 버튼을 눌러 메일 서비스 도메인을 추가하세요.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedDomains.map((domain) => {
                  const isSelected = selectedIds.includes(domain.id);
                  const createdDate = new Date(domain.createdAt).toISOString().slice(0, 10);

                  return (
                    <tr
                      key={domain.id}
                      className={`transition-colors duration-100 hover:bg-slate-50/80 ${
                        isSelected ? 'bg-indigo-50/40' : 'bg-white'
                      }`}
                    >
                      {/* 선택 체크박스 */}
                      <td
                        className="px-4 py-3.5 text-center"
                        onClick={(e) => handleToggleSelect(domain.id, e)}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </td>

                      {/* 등록일자 */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-slate-600 font-mono">
                        {createdDate}
                      </td>

                      {/* 도메인 정보 */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                            domain.isDefault
                              ? 'bg-amber-50 text-amber-600 ring-1 ring-amber-200'
                              : 'bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100'
                          }`}>
                            <Globe className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-900 font-mono text-sm">
                                {domain.name}
                              </span>
                              {domain.isDefault && (
                                <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200">
                                  <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                                  기본 도메인
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate max-w-sm">
                              {domain.description || '별도 설명 없음'}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 연동 사서함 수 */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                          <Layers className="h-3 w-3 text-slate-400" />
                          {domain.mailboxCount ?? 0}개 사서함
                        </span>
                      </td>

                      {/* DNS 설정 가이드 및 실시간 보안 진단 버튼 */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedDomainForDns(domain)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 hover:text-indigo-600 hover:border-indigo-200 transition"
                            title="MX / SPF / DKIM DNS 레코드 설정 안내 보기"
                          >
                            <HelpCircle className="h-3.5 w-3.5 text-indigo-500" />
                            <span>DNS 가이드</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => runHealthCheck(domain)}
                            className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100 transition shadow-xs"
                            title="DNS 보안 4종(MX/SPF/DKIM/DMARC) 및 RBL 블랙리스트 실시간 진단"
                          >
                            <Activity className="h-3.5 w-3.5 text-indigo-600" />
                            <span>보안 진단</span>
                          </button>
                        </div>
                      </td>

                      {/* 수신 상태 (토글 버튼) */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleToggleActive(domain)}
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition ${
                            domain.isActive
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                              : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'
                          }`}
                          title="상태 클릭 시 활성/비활성 토글 (비활성화 시 소속 전체 사서함 수신 차단)"
                        >
                          {domain.isActive ? (
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
                        <div className="flex items-center justify-end gap-1">
                          {!domain.isDefault && (
                            <button
                              type="button"
                              onClick={() => handleSetDefault(domain)}
                              className="p-1 rounded-lg text-slate-400 hover:bg-amber-50 hover:text-amber-600 transition"
                              title="대표 기본 도메인으로 설정"
                            >
                              <Star className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDelete(domain)}
                            disabled={domain.isDefault}
                            className="p-1 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition disabled:opacity-30 disabled:cursor-not-allowed"
                            title={domain.isDefault ? '기본 도메인은 삭제할 수 없습니다' : '도메인 삭제'}
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
        <div className="px-5 py-3.5 border-t border-slate-100 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-slate-500">
          <div>
            총 <span className="font-semibold text-slate-800">{filteredDomains.length}</span>개 도메인 중{' '}
            <span className="font-semibold text-slate-800">
              {displayStart} - {displayEnd}
            </span>
            개 표시
          </div>

          {paginatedDomains.length > 0 && (
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

      {/* Modal: 신규 도메인 등록 */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2">
              <Globe className="h-5 w-5 text-indigo-600" />
              <span>신규 도메인 등록</span>
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              등록된 도메인은 사서함 등록 및 메일 인바운드 수신 허용 도메인으로 사용됩니다.
            </p>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  도메인명 (FQDN)
                </label>
                <input
                  type="text"
                  required
                  placeholder="예: lineedge.com 또는 mail.company.com"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  도메인 설명 (선택)
                </label>
                <input
                  type="text"
                  placeholder="예: 본사 공식 메일 도메인"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="defaultDomainCheckbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <label htmlFor="defaultDomainCheckbox" className="text-xs text-slate-700 cursor-pointer select-none font-medium">
                  시스템 기본 대표 도메인으로 지정
                </label>
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
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition disabled:opacity-50"
                >
                  {creating ? '등록 중...' : '등록하기'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: DNS 설정 가이드 */}
      {selectedDomainForDns && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-indigo-600" />
                  <span>DNS 레코드 설정 가이드</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1 font-mono">
                  대상 도메인: <strong className="text-indigo-600 font-bold">{selectedDomainForDns.name}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDomainForDns(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5 my-4 text-xs">
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 space-y-2">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-indigo-600"></span>
                  1. MX 레코드 (메일 수신 목적지)
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-slate-200 font-mono text-[11px] text-slate-700">
                  <div><strong>호스트:</strong> @</div>
                  <div><strong>타입:</strong> MX</div>
                  <div><strong>우선순위(Priority):</strong> 10</div>
                  <div><strong>값(Value):</strong> mail.{selectedDomainForDns.name}</div>
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 space-y-2">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-600"></span>
                  2. SPF 레코드 (발송자 인증 및 스팸 방지)
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-slate-200 font-mono text-[11px] text-slate-700">
                  <div><strong>호스트:</strong> @</div>
                  <div><strong>타입:</strong> TXT</div>
                  <div><strong>값(Value):</strong> v=spf1 mx ~all</div>
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 space-y-2">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-sky-600"></span>
                  3. DMARC 레코드 (메일 보안 정책)
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-slate-200 font-mono text-[11px] text-slate-700">
                  <div><strong>호스트:</strong> _dmarc</div>
                  <div><strong>타입:</strong> TXT</div>
                  <div><strong>값(Value):</strong> v=DMARC1; p=none; rua=mailto:postmaster@{selectedDomainForDns.name}</div>
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 space-y-2">
                <div className="font-bold text-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-violet-600"></span>
                    4. DKIM 레코드 (발신 메일 암호화 서명 및 무결성)
                  </div>
                  <button
                    type="button"
                    disabled={generatingDkim}
                    onClick={handleGenerateDkim}
                    className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition disabled:opacity-50"
                  >
                    {generatingDkim ? '생성 중...' : dkimInfo?.hasKey ? 'DKIM 재발급' : 'DKIM 키 생성'}
                  </button>
                </div>
                {dkimInfo?.hasKey ? (
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200 font-mono text-[11px] text-slate-700 space-y-1 break-all">
                    <div><strong>호스트:</strong> {dkimInfo.dnsHostRecord}</div>
                    <div><strong>타입:</strong> TXT</div>
                    <div><strong>값(Value):</strong> {dkimInfo.dnsTxtRecord}</div>
                  </div>
                ) : (
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-[11px] text-slate-500">
                    아직 등록된 DKIM 서명 키가 없습니다. 우측 'DKIM 키 생성' 버튼을 클릭하면 2048-bit RSA 서명 키 쌍이 자동 생성됩니다.
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedDomainForDns(null)}
                className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: 도메인 DNS 보안 및 평판 실시간 진단 (Health Check) */}
      {selectedDomainForHealth && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Activity className="h-5 w-5 text-indigo-600" />
                  <span>DNS 보안 4종 및 평판 실시간 진단 (Health Check)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1 font-mono">
                  대상 도메인: <strong className="text-indigo-600 font-bold">{selectedDomainForHealth.name}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDomainForHealth(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>

            {loadingHealth ? (
              <div className="py-12 flex flex-col items-center justify-center space-y-3 text-slate-500 text-xs">
                <RefreshCw className="h-7 w-7 animate-spin text-indigo-600" />
                <span>네임서버(DNS) 레코드 및 RBL 블랙리스트 실시간 조회 중...</span>
              </div>
            ) : healthReport ? (
              <div className="space-y-4">
                {/* 종합 점수 카드 */}
                <div className="rounded-xl p-4 border flex items-center justify-between bg-gradient-to-r from-slate-50 to-indigo-50/40 border-slate-200">
                  <div>
                    <div className="text-xs text-slate-500 font-medium">종합 보안 인증 점수</div>
                    <div className="text-2xl font-black text-slate-900 mt-0.5">
                      {healthReport.overallScore} <span className="text-xs font-normal text-slate-500">/ 100점</span>
                    </div>
                  </div>
                  <div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold border ${
                        healthReport.grade === 'EXCELLENT'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : healthReport.grade === 'GOOD'
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                          : healthReport.grade === 'WARNING'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}
                    >
                      {healthReport.grade === 'EXCELLENT' && '최우수 (안전)'}
                      {healthReport.grade === 'GOOD' && '우수 (정상)'}
                      {healthReport.grade === 'WARNING' && '주의 (보안 취약)'}
                      {healthReport.grade === 'CRITICAL' && '위험 (설정 누락)'}
                    </span>
                  </div>
                </div>

                {/* 5종 체크리스트 항목 */}
                <div className="space-y-2 text-xs">
                  {Object.entries(healthReport.items).map(([key, item]: [string, any]) => (
                    <div key={key} className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-800">{item.name}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            item.status === 'PASS'
                              ? 'bg-emerald-100 text-emerald-800'
                              : item.status === 'WARN'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {item.status} ({item.score}/{item.maxScore}점)
                        </span>
                      </div>
                      <p className="text-slate-600 text-[11px]">{item.message}</p>
                      {item.value && (
                        <div className="font-mono text-[10px] bg-white p-1.5 rounded border border-slate-200 text-slate-700 truncate">
                          {item.value}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* 권장 개선 가이드 및 KISA 화이트도메인 안내 */}
                {healthReport.recommendations?.length > 0 && (
                  <div className="rounded-xl p-3.5 bg-amber-50/70 border border-amber-200 text-xs space-y-2">
                    <div className="font-bold text-amber-900 flex items-center gap-1.5">
                      <AlertCircle className="h-4 w-4 text-amber-600" />
                      <span>보안 권고안 및 도달률 개선 가이드</span>
                    </div>
                    <ul className="list-disc list-inside space-y-1 text-[11px] text-amber-800">
                      {healthReport.recommendations.map((rec: string, i: number) => (
                        <li key={i}>{rec}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : null}

            <div className="flex items-center justify-between pt-4 border-t border-slate-100 mt-4">
              <button
                type="button"
                onClick={() => runHealthCheck(selectedDomainForHealth)}
                disabled={loadingHealth}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingHealth ? 'animate-spin' : ''}`} />
                <span>다시 진단</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedDomainForHealth(null)}
                className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
