'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Award, Plus, RefreshCw, X, CheckCircle2, AlertCircle } from 'lucide-react';
import type { OrgRankDto, OrgTitleDto, RankPresetType } from '@lemail/shared-types';
import { PageHeader, SelectDropdown } from '@/components/common';
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
    <div className="space-y-6">
      <PageHeader
        title="직급/직책 관리"
        icon={<Award className="h-6 w-6 text-sky-600" />}
        subtitle="조직원들의 직급(직위)과 직책 마스터를 관리합니다. 등록된 항목은 사용자 등록 및 수정 시 선택 항목으로 제공됩니다."
        action={
          <div className="flex items-center gap-2 print:hidden">
            <button
              type="button"
              onClick={openCreateRankModal}
              className="btn btn-sm btn-secondary inline-flex items-center gap-1.5 text-xs font-semibold"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>직급 추가</span>
            </button>
            <button
              type="button"
              onClick={openCreateTitleModal}
              className="btn btn-sm btn-primary inline-flex items-center gap-1.5 text-xs font-semibold"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>직책 추가</span>
            </button>
          </div>
        }
      />

      {errorMsg && (
        <div className="flex items-center justify-between rounded-xl p-4 text-xs font-medium border bg-rose-50 text-rose-800 border-rose-200 animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-slate-400 hover:text-slate-600 font-bold ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {statusMsg && (
        <div className="flex items-center justify-between rounded-xl p-4 text-xs font-medium border bg-emerald-50 text-emerald-800 border-emerald-200 animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{statusMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMsg(null)}
            className="text-slate-400 hover:text-slate-600 font-bold ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {/* 좌우 반 분할 컨텐츠 영역 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
        {/* 좌측: 직급 관리 */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden flex flex-col min-h-[620px]">
          {/* 1단 헤더 (h-12) */}
          <div className="h-12 px-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <Award className="h-4 w-4 text-sky-600 shrink-0" />
              <span className="text-xs font-bold text-slate-900">직급 (직위) 관리</span>
              <span className="rounded-full bg-slate-200/70 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 font-mono">
                {ranks.length}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {selectedRankIds.size > 0 && (
                <div className="flex items-center gap-1.5 pr-2 border-r border-slate-200">
                  <span className="text-[11px] font-semibold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-lg border border-sky-200">
                    {selectedRankIds.size}건 선택
                  </span>
                  <button
                    type="button"
                    onClick={handleBulkDeleteRanks}
                    className="btn btn-sm btn-secondary text-[11px] font-medium text-rose-600 hover:text-rose-700 border-rose-200 hover:border-rose-300 bg-rose-50/50"
                  >
                    선택 삭제
                  </button>
                </div>
              )}
              <SelectDropdown
                options={[
                  { value: 'GENERAL', label: '일반기업 템플릿' },
                  { value: 'PUBLIC_RESEARCH', label: '공공연구 템플릿' },
                  { value: 'MANUFACTURING', label: '제조생산 템플릿' },
                ]}
                value={presetValue}
                disabled={applyingPreset}
                onChange={handlePresetChange}
                placeholder={applyingPreset ? '적용 중...' : '업종 템플릿 추가'}
                headerLabel="직급 업종 템플릿"
                size="sm"
                menuWidthClass="w-44"
              />
              <button
                type="button"
                onClick={fetchData}
                disabled={loading}
                title="새로고침"
                className="btn btn-sm btn-secondary p-1.5 text-slate-500 hover:text-slate-800"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200/80 bg-slate-50 text-slate-600 font-medium select-none">
                  <th className="w-10 px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={allRanksSelected}
                      onChange={toggleAllRanks}
                      aria-label="직급 전체 선택"
                      className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                    />
                  </th>
                  <th className="w-16 px-4 py-3 whitespace-nowrap">레벨</th>
                  <th className="px-4 py-3 whitespace-nowrap">직위명</th>
                  <th className="px-4 py-3 whitespace-nowrap">직위코드</th>
                  <th className="px-4 py-3 whitespace-nowrap">설명</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {ranks.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-16 text-center text-slate-400">
                      {loading
                        ? '불러오는 중입니다...'
                        : '등록된 직급이 없습니다. 상단에서 업종 템플릿을 선택하거나 직접 추가해 주세요.'}
                    </td>
                  </tr>
                ) : (
                  ranks.map((rank) => (
                    <tr
                      key={rank.id}
                      onClick={() => openEditRankModal(rank)}
                      className={`cursor-pointer hover:bg-slate-50/80 transition-colors ${
                        selectedRankIds.has(rank.id) ? 'bg-sky-50/40' : 'bg-white'
                      }`}
                      title="클릭하여 직급 정보 수정"
                    >
                      <td
                        className="px-4 py-3 text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selectedRankIds.has(rank.id)}
                          onChange={() => toggleRankSelection(rank.id)}
                          aria-label={`${rank.name} 선택`}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] font-semibold text-sky-600">
                        {rank.level}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{rank.name}</td>
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-500">{rank.code}</td>
                      <td className="px-4 py-3 text-slate-500 max-w-[180px] truncate" title={rank.description || ''}>
                        {rank.description || '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* 우측: 직책 관리 */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden flex flex-col min-h-[620px]">
          {/* 1단 헤더 (h-12) */}
          <div className="h-12 px-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <Award className="h-4 w-4 text-sky-600 shrink-0" />
              <span className="text-xs font-bold text-slate-900">직책 관리</span>
              <span className="rounded-full bg-slate-200/70 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 font-mono">
                {titles.length}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {selectedTitleIds.size > 0 && (
                <div className="flex items-center gap-1.5 pr-2 border-r border-slate-200">
                  <span className="text-[11px] font-semibold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-lg border border-sky-200">
                    {selectedTitleIds.size}건 선택
                  </span>
                  <button
                    type="button"
                    onClick={handleBulkDeleteTitles}
                    className="btn btn-sm btn-secondary text-[11px] font-medium text-rose-600 hover:text-rose-700 border-rose-200 hover:border-rose-300 bg-rose-50/50"
                  >
                    선택 삭제
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={fetchData}
                disabled={loading}
                title="새로고침"
                className="btn btn-sm btn-secondary p-1.5 text-slate-500 hover:text-slate-800"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200/80 bg-slate-50 text-slate-600 font-medium select-none">
                  <th className="w-10 px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={allTitlesSelected}
                      onChange={toggleAllTitles}
                      aria-label="직책 전체 선택"
                      className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                    />
                  </th>
                  <th className="w-16 px-4 py-3 whitespace-nowrap">순서</th>
                  <th className="px-4 py-3 whitespace-nowrap">직책명</th>
                  <th className="px-4 py-3 whitespace-nowrap">설명</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {titles.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-16 text-center text-slate-400">
                      {loading ? '불러오는 중입니다...' : '등록된 직책이 없습니다. 상단의 직책 추가 버튼으로 등록해 주세요.'}
                    </td>
                  </tr>
                ) : (
                  titles.map((title) => (
                    <tr
                      key={title.id}
                      onClick={() => openEditTitleModal(title)}
                      className={`cursor-pointer hover:bg-slate-50/80 transition-colors ${
                        selectedTitleIds.has(title.id) ? 'bg-sky-50/40' : 'bg-white'
                      }`}
                      title="클릭하여 직책 정보 수정"
                    >
                      <td
                        className="px-4 py-3 text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selectedTitleIds.has(title.id)}
                          onChange={() => toggleTitleSelection(title.id)}
                          aria-label={`${title.name} 선택`}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] font-semibold text-sky-600">
                        {title.sortOrder}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{title.name}</td>
                      <td className="px-4 py-3 text-slate-500 max-w-[220px] truncate" title={title.description || ''}>
                        {title.description || '-'}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h3 className="text-base font-bold text-slate-900">
                {editingRank ? '직급 수정' : '직급 추가'}
              </h3>
              <button
                type="button"
                onClick={() => setRankModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveRank} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    레벨 (서열) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={rankForm.level}
                    onChange={(e) => setRankForm({ ...rankForm, level: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
                    placeholder="예: 10"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    직위코드 <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={50}
                    value={rankForm.code}
                    onChange={(e) => setRankForm({ ...rankForm, code: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
                    placeholder="예: GEN_10"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  직위명 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={rankForm.name}
                  onChange={(e) => setRankForm({ ...rankForm, name: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
                  placeholder="예: 과장"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">설명</label>
                <input
                  type="text"
                  maxLength={255}
                  value={rankForm.description}
                  onChange={(e) => setRankForm({ ...rankForm, description: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
                  placeholder="직급에 대한 설명을 입력하세요."
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRankModalOpen(false)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={rankSaving}
                  className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h3 className="text-base font-bold text-slate-900">
                {editingTitle ? '직책 수정' : '직책 추가'}
              </h3>
              <button
                type="button"
                onClick={() => setTitleModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTitle} className="p-5 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    순서 (서열) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={titleForm.sortOrder}
                    onChange={(e) => setTitleForm({ ...titleForm, sortOrder: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
                    placeholder="예: 10"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    직책명 <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={100}
                    value={titleForm.name}
                    onChange={(e) => setTitleForm({ ...titleForm, name: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
                    placeholder="예: 팀장"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">설명</label>
                <input
                  type="text"
                  maxLength={255}
                  value={titleForm.description}
                  onChange={(e) => setTitleForm({ ...titleForm, description: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
                  placeholder="직책에 대한 설명을 입력하세요."
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setTitleModalOpen(false)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={titleSaving}
                  className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
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
