'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Award, Plus, Trash2, Pencil, RefreshCw, X, Sparkles } from 'lucide-react';
import type { OrgRankDto, OrgTitleDto, RankPresetType } from '@lemail/shared-types';
import { PageHeader } from '@/components/common';
import { orgApi } from '@/lib/api';

interface RankFormState {
  level: string;
  name: string;
  code: string;
  description: string;
}

interface TitleFormState {
  sortOrder: string;
  name: string;
  description: string;
}

const EMPTY_RANK_FORM: RankFormState = {
  level: '10',
  name: '',
  code: '',
  description: '',
};

const EMPTY_TITLE_FORM: TitleFormState = {
  sortOrder: '10',
  name: '',
  description: '',
};

export default function PositionsPage() {
  const [ranks, setRanks] = useState<OrgRankDto[]>([]);
  const [titles, setTitles] = useState<OrgTitleDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // 체크박스 선택 상태
  const [selectedRankIds, setSelectedRankIds] = useState<Set<string>>(new Set());
  const [selectedTitleIds, setSelectedTitleIds] = useState<Set<string>>(new Set());

  // 직급 모달 상태
  const [rankModalOpen, setRankModalOpen] = useState(false);
  const [editingRank, setEditingRank] = useState<OrgRankDto | null>(null);
  const [rankForm, setRankForm] = useState<RankFormState>(EMPTY_RANK_FORM);
  const [rankSaving, setRankSaving] = useState(false);

  // 직책 모달 상태
  const [titleModalOpen, setTitleModalOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState<OrgTitleDto | null>(null);
  const [titleForm, setTitleForm] = useState<TitleFormState>(EMPTY_TITLE_FORM);
  const [titleSaving, setTitleSaving] = useState(false);

  // 템플릿 적용 상태
  const [presetValue, setPresetValue] = useState<'' | RankPresetType>('');
  const [applyingPreset, setApplyingPreset] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [rankList, titleList] = await Promise.all([
        orgApi.getRanks(),
        orgApi.getTitles(),
      ]);
      setRanks(rankList);
      setTitles(titleList);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : '데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ==================== 직급 핸들러 ====================

  const allRanksSelected = ranks.length > 0 && selectedRankIds.size === ranks.length;

  const toggleAllRanks = () => {
    if (allRanksSelected) {
      setSelectedRankIds(new Set());
    } else {
      setSelectedRankIds(new Set(ranks.map((r) => r.id)));
    }
  };

  const toggleRankSelection = (id: string) => {
    setSelectedRankIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openCreateRankModal = () => {
    const nextLevel =
      ranks.length > 0 ? Math.max(...ranks.map((r) => r.level)) + 10 : 10;
    setEditingRank(null);
    setRankForm({ ...EMPTY_RANK_FORM, level: String(nextLevel) });
    setRankModalOpen(true);
  };

  const openEditRankModal = (rank: OrgRankDto) => {
    setEditingRank(rank);
    setRankForm({
      level: String(rank.level),
      name: rank.name,
      code: rank.code,
      description: rank.description || '',
    });
    setRankModalOpen(true);
  };

  const handleSaveRank = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);
    const parsedLevel = parseInt(rankForm.level, 10);
    if (Number.isNaN(parsedLevel) || parsedLevel < 0) {
      setErrorMsg('레벨(서열)은 0 이상의 정수로 입력해 주세요.');
      return;
    }
    if (!rankForm.name.trim() || !rankForm.code.trim()) {
      setErrorMsg('직위명과 직위코드를 모두 입력해 주세요.');
      return;
    }

    setRankSaving(true);
    try {
      if (editingRank) {
        await orgApi.updateRank(editingRank.id, {
          level: parsedLevel,
          name: rankForm.name.trim(),
          code: rankForm.code.trim(),
          description: rankForm.description.trim() || null,
        });
        setStatusMsg(`직급 '${rankForm.name.trim()}'이(가) 수정되었습니다.`);
      } else {
        await orgApi.createRank({
          level: parsedLevel,
          name: rankForm.name.trim(),
          code: rankForm.code.trim(),
          description: rankForm.description.trim() || null,
        });
        setStatusMsg(`직급 '${rankForm.name.trim()}'이(가) 추가되었습니다.`);
      }
      setRankModalOpen(false);
      await fetchData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : '직급 저장 중 오류가 발생했습니다.');
    } finally {
      setRankSaving(false);
    }
  };

  const handleBulkDeleteRanks = async () => {
    if (selectedRankIds.size === 0) return;
    if (!window.confirm(`선택한 ${selectedRankIds.size}건의 직급을 삭제하시겠습니까?`)) {
      return;
    }
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const res = await orgApi.bulkDeleteRanks(Array.from(selectedRankIds));
      setSelectedRankIds(new Set());
      setStatusMsg(`${res.deletedCount}건의 직급이 삭제되었습니다.`);
      await fetchData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : '직급 삭제 중 오류가 발생했습니다.');
    }
  };

  const handlePresetChange = async (value: string) => {
    if (!value) return;
    const preset = value as RankPresetType;
    setPresetValue(preset);
    setApplyingPreset(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const res = await orgApi.applyRankPreset(preset);
      setRanks(res.items);
      const labelMap: Record<RankPresetType, string> = {
        GENERAL: '일반기업',
        PUBLIC_RESEARCH: '공공연구',
        MANUFACTURING: '제조생산',
      };
      setStatusMsg(
        `[${labelMap[preset]}] 템플릿 적용 완료: ${res.addedCount}건 추가` +
          (res.skippedCount > 0 ? ` (중복 ${res.skippedCount}건 제외)` : ''),
      );
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : '템플릿 적용 중 오류가 발생했습니다.');
    } finally {
      setApplyingPreset(false);
      setPresetValue('');
    }
  };

  // ==================== 직책 핸들러 ====================

  const allTitlesSelected = titles.length > 0 && selectedTitleIds.size === titles.length;

  const toggleAllTitles = () => {
    if (allTitlesSelected) {
      setSelectedTitleIds(new Set());
    } else {
      setSelectedTitleIds(new Set(titles.map((t) => t.id)));
    }
  };

  const toggleTitleSelection = (id: string) => {
    setSelectedTitleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openCreateTitleModal = () => {
    const nextOrder =
      titles.length > 0 ? Math.max(...titles.map((t) => t.sortOrder)) + 10 : 10;
    setEditingTitle(null);
    setTitleForm({ ...EMPTY_TITLE_FORM, sortOrder: String(nextOrder) });
    setTitleModalOpen(true);
  };

  const openEditTitleModal = (title: OrgTitleDto) => {
    setEditingTitle(title);
    setTitleForm({
      sortOrder: String(title.sortOrder),
      name: title.name,
      description: title.description || '',
    });
    setTitleModalOpen(true);
  };

  const handleSaveTitle = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);
    const parsedOrder = parseInt(titleForm.sortOrder, 10);
    if (Number.isNaN(parsedOrder) || parsedOrder < 0) {
      setErrorMsg('순서(서열)는 0 이상의 정수로 입력해 주세요.');
      return;
    }
    if (!titleForm.name.trim()) {
      setErrorMsg('직책명을 입력해 주세요.');
      return;
    }

    setTitleSaving(true);
    try {
      if (editingTitle) {
        await orgApi.updateTitle(editingTitle.id, {
          sortOrder: parsedOrder,
          name: titleForm.name.trim(),
          description: titleForm.description.trim() || null,
        });
        setStatusMsg(`직책 '${titleForm.name.trim()}'이(가) 수정되었습니다.`);
      } else {
        await orgApi.createTitle({
          sortOrder: parsedOrder,
          name: titleForm.name.trim(),
          description: titleForm.description.trim() || null,
        });
        setStatusMsg(`직책 '${titleForm.name.trim()}'이(가) 추가되었습니다.`);
      }
      setTitleModalOpen(false);
      await fetchData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : '직책 저장 중 오류가 발생했습니다.');
    } finally {
      setTitleSaving(false);
    }
  };

  const handleBulkDeleteTitles = async () => {
    if (selectedTitleIds.size === 0) return;
    if (!window.confirm(`선택한 ${selectedTitleIds.size}건의 직책을 삭제하시겠습니까?`)) {
      return;
    }
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const res = await orgApi.bulkDeleteTitles(Array.from(selectedTitleIds));
      setSelectedTitleIds(new Set());
      setStatusMsg(`${res.deletedCount}건의 직책이 삭제되었습니다.`);
      await fetchData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : '직책 삭제 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="직급/직책 관리"
        icon={<Award className="h-6 w-6 text-[#0071e3]" />}
        subtitle="조직원의 직급(직위)과 직책 마스터를 관리합니다. 등록된 항목은 사용자 등록 및 수정 시 선택 항목으로 제공됩니다."
        action={
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.1] bg-white px-3 py-1.5 text-xs font-medium text-[#1d1d1f] hover:bg-black/[0.03] transition disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>새로고침</span>
          </button>
        }
      />

      {errorMsg && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700 flex items-center justify-between">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg(null)} className="text-red-500 hover:text-red-700">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {statusMsg && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs text-blue-700 flex items-center justify-between">
          <span>{statusMsg}</span>
          <button type="button" onClick={() => setStatusMsg(null)} className="text-blue-500 hover:text-blue-700">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* 좌우 반 분할 컨텐츠 영역 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* 좌측: 직급 관리 */}
        <section className="rounded-xl border border-black/[0.08] bg-white shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/[0.06] px-4 py-3 bg-[#fafafa]">
            <div>
              <h2 className="text-sm font-semibold text-[#1d1d1f]">
                직급 (직위) 관리
                <span className="ml-1.5 text-xs font-normal text-[#86868b]">({ranks.length})</span>
              </h2>
              <p className="text-[11px] text-[#86868b]">레벨 오름차순으로 정렬됩니다.</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative inline-flex items-center">
                <Sparkles className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-[#0071e3]" />
                <select
                  aria-label="직급 업종 템플릿 선택"
                  value={presetValue}
                  disabled={applyingPreset}
                  onChange={(e) => handlePresetChange(e.target.value)}
                  className="rounded-lg border border-black/[0.1] bg-white pl-7 pr-6 py-1.5 text-xs font-medium text-[#1d1d1f] focus:border-[#0071e3] focus:outline-none disabled:opacity-50"
                >
                  <option value="">{applyingPreset ? '적용 중...' : '업종 템플릿 추가'}</option>
                  <option value="GENERAL">일반기업</option>
                  <option value="PUBLIC_RESEARCH">공공연구</option>
                  <option value="MANUFACTURING">제조생산</option>
                </select>
              </div>

              <button
                type="button"
                onClick={handleBulkDeleteRanks}
                disabled={selectedRankIds.size === 0}
                className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>선택 삭제{selectedRankIds.size > 0 ? ` (${selectedRankIds.size})` : ''}</span>
              </button>

              <button
                type="button"
                onClick={openCreateRankModal}
                className="inline-flex items-center gap-1 rounded-lg bg-[#0071e3] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0077ed] transition shadow-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>직급 추가</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-black/[0.06] bg-slate-50/70 text-[11px] font-semibold text-[#6e6e73]">
                  <th className="w-10 px-3 py-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={allRanksSelected}
                      onChange={toggleAllRanks}
                      aria-label="직급 전체 선택"
                      className="h-3.5 w-3.5 rounded border-slate-300 text-[#0071e3] focus:ring-[#0071e3]"
                    />
                  </th>
                  <th className="w-16 px-3 py-2.5">레벨</th>
                  <th className="px-3 py-2.5">직위명</th>
                  <th className="px-3 py-2.5">직위코드</th>
                  <th className="px-3 py-2.5">설명</th>
                  <th className="w-14 px-3 py-2.5 text-center">수정</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.05] text-xs">
                {ranks.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-[#86868b]">
                      {loading
                        ? '불러오는 중입니다...'
                        : '등록된 직급이 없습니다. 상단에서 업종 템플릿을 선택하거나 직접 추가해 주세요.'}
                    </td>
                  </tr>
                ) : (
                  ranks.map((rank) => (
                    <tr
                      key={rank.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        selectedRankIds.has(rank.id) ? 'bg-blue-50/40' : ''
                      }`}
                    >
                      <td className="px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={selectedRankIds.has(rank.id)}
                          onChange={() => toggleRankSelection(rank.id)}
                          aria-label={`${rank.name} 선택`}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-[#0071e3] focus:ring-[#0071e3]"
                        />
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px] font-semibold text-[#0071e3]">
                        {rank.level}
                      </td>
                      <td className="px-3 py-2.5 font-medium text-[#1d1d1f]">{rank.name}</td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-[#6e6e73]">{rank.code}</td>
                      <td className="px-3 py-2.5 text-[#6e6e73] max-w-[180px] truncate" title={rank.description || ''}>
                        {rank.description || '-'}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => openEditRankModal(rank)}
                          title="직급 수정"
                          className="rounded-md p-1 text-[#6e6e73] hover:bg-black/[0.05] hover:text-[#1d1d1f] transition"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* 우측: 직책 관리 */}
        <section className="rounded-xl border border-black/[0.08] bg-white shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/[0.06] px-4 py-3 bg-[#fafafa]">
            <div>
              <h2 className="text-sm font-semibold text-[#1d1d1f]">
                직책 관리
                <span className="ml-1.5 text-xs font-normal text-[#86868b]">({titles.length})</span>
              </h2>
              <p className="text-[11px] text-[#86868b]">순서 오름차순으로 정렬됩니다.</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleBulkDeleteTitles}
                disabled={selectedTitleIds.size === 0}
                className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>선택 삭제{selectedTitleIds.size > 0 ? ` (${selectedTitleIds.size})` : ''}</span>
              </button>

              <button
                type="button"
                onClick={openCreateTitleModal}
                className="inline-flex items-center gap-1 rounded-lg bg-[#0071e3] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0077ed] transition shadow-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>직책 추가</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-black/[0.06] bg-slate-50/70 text-[11px] font-semibold text-[#6e6e73]">
                  <th className="w-10 px-3 py-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={allTitlesSelected}
                      onChange={toggleAllTitles}
                      aria-label="직책 전체 선택"
                      className="h-3.5 w-3.5 rounded border-slate-300 text-[#0071e3] focus:ring-[#0071e3]"
                    />
                  </th>
                  <th className="w-16 px-3 py-2.5">순서</th>
                  <th className="px-3 py-2.5">직책명</th>
                  <th className="px-3 py-2.5">설명</th>
                  <th className="w-14 px-3 py-2.5 text-center">수정</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.05] text-xs">
                {titles.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-[#86868b]">
                      {loading ? '불러오는 중입니다...' : '등록된 직책이 없습니다. 직책을 추가해 주세요.'}
                    </td>
                  </tr>
                ) : (
                  titles.map((title) => (
                    <tr
                      key={title.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        selectedTitleIds.has(title.id) ? 'bg-blue-50/40' : ''
                      }`}
                    >
                      <td className="px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={selectedTitleIds.has(title.id)}
                          onChange={() => toggleTitleSelection(title.id)}
                          aria-label={`${title.name} 선택`}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-[#0071e3] focus:ring-[#0071e3]"
                        />
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px] font-semibold text-[#0071e3]">
                        {title.sortOrder}
                      </td>
                      <td className="px-3 py-2.5 font-medium text-[#1d1d1f]">{title.name}</td>
                      <td className="px-3 py-2.5 text-[#6e6e73] max-w-[220px] truncate" title={title.description || ''}>
                        {title.description || '-'}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => openEditTitleModal(title)}
                          title="직책 수정"
                          className="rounded-md p-1 text-[#6e6e73] hover:bg-black/[0.05] hover:text-[#1d1d1f] transition"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* 직급 등록/수정 모달 */}
      {rankModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-black/[0.08] overflow-hidden">
            <div className="flex items-center justify-between border-b border-black/[0.06] px-5 py-3.5">
              <h3 className="text-sm font-semibold text-[#1d1d1f]">
                {editingRank ? '직급 수정' : '직급 추가'}
              </h3>
              <button
                type="button"
                onClick={() => setRankModalOpen(false)}
                className="rounded-lg p-1 text-[#86868b] hover:bg-black/[0.05]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveRank} className="p-5 space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1d1d1f] mb-1">
                    레벨 (서열) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={rankForm.level}
                    onChange={(e) => setRankForm({ ...rankForm, level: e.target.value })}
                    className="w-full rounded-lg border border-black/[0.12] px-3 py-2 text-xs focus:border-[#0071e3] focus:outline-none"
                    placeholder="예: 10"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1d1d1f] mb-1">
                    직위코드 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={50}
                    value={rankForm.code}
                    onChange={(e) => setRankForm({ ...rankForm, code: e.target.value })}
                    className="w-full rounded-lg border border-black/[0.12] px-3 py-2 text-xs focus:border-[#0071e3] focus:outline-none"
                    placeholder="예: GEN_10"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1d1d1f] mb-1">
                  직위명 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={rankForm.name}
                  onChange={(e) => setRankForm({ ...rankForm, name: e.target.value })}
                  className="w-full rounded-lg border border-black/[0.12] px-3 py-2 text-xs focus:border-[#0071e3] focus:outline-none"
                  placeholder="예: 과장"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1d1d1f] mb-1">설명</label>
                <input
                  type="text"
                  maxLength={255}
                  value={rankForm.description}
                  onChange={(e) => setRankForm({ ...rankForm, description: e.target.value })}
                  className="w-full rounded-lg border border-black/[0.12] px-3 py-2 text-xs focus:border-[#0071e3] focus:outline-none"
                  placeholder="직급에 대한 설명을 입력하세요."
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRankModalOpen(false)}
                  className="rounded-lg border border-black/[0.1] px-3.5 py-1.5 text-xs font-medium text-[#1d1d1f] hover:bg-black/[0.03]"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={rankSaving}
                  className="rounded-lg bg-[#0071e3] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#0077ed] disabled:opacity-50"
                >
                  {rankSaving ? '저장 중...' : '저장'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 직책 등록/수정 모달 */}
      {titleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-black/[0.08] overflow-hidden">
            <div className="flex items-center justify-between border-b border-black/[0.06] px-5 py-3.5">
              <h3 className="text-sm font-semibold text-[#1d1d1f]">
                {editingTitle ? '직책 수정' : '직책 추가'}
              </h3>
              <button
                type="button"
                onClick={() => setTitleModalOpen(false)}
                className="rounded-lg p-1 text-[#86868b] hover:bg-black/[0.05]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTitle} className="p-5 space-y-3.5">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1d1d1f] mb-1">
                    순서 (서열) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={titleForm.sortOrder}
                    onChange={(e) => setTitleForm({ ...titleForm, sortOrder: e.target.value })}
                    className="w-full rounded-lg border border-black/[0.12] px-3 py-2 text-xs focus:border-[#0071e3] focus:outline-none"
                    placeholder="예: 10"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-[#1d1d1f] mb-1">
                    직책명 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={100}
                    value={titleForm.name}
                    onChange={(e) => setTitleForm({ ...titleForm, name: e.target.value })}
                    className="w-full rounded-lg border border-black/[0.12] px-3 py-2 text-xs focus:border-[#0071e3] focus:outline-none"
                    placeholder="예: 팀장"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1d1d1f] mb-1">설명</label>
                <input
                  type="text"
                  maxLength={255}
                  value={titleForm.description}
                  onChange={(e) => setTitleForm({ ...titleForm, description: e.target.value })}
                  className="w-full rounded-lg border border-black/[0.12] px-3 py-2 text-xs focus:border-[#0071e3] focus:outline-none"
                  placeholder="직책에 대한 설명을 입력하세요."
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setTitleModalOpen(false)}
                  className="rounded-lg border border-black/[0.1] px-3.5 py-1.5 text-xs font-medium text-[#1d1d1f] hover:bg-black/[0.03]"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={titleSaving}
                  className="rounded-lg bg-[#0071e3] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#0077ed] disabled:opacity-50"
                >
                  {titleSaving ? '저장 중...' : '저장'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
