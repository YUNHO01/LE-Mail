'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  CalendarDays,
  RefreshCw,
  Plus,
  Upload,
  Trash2,
  CheckCircle2,
  XCircle,
  Save,
  X,
  KeyRound,
  Globe,
} from 'lucide-react';
import {
  SystemHolidayDto,
  HolidaySyncSettingsDto,
  HolidaySource,
} from '@lemail/shared-types';
import { adminHolidaysApi } from '../../../lib/api';
import { PageHeader } from '../../../components/common/PageHeader';

const SOURCE_LABELS: Record<HolidaySource, { label: string; cls: string }> = {
  KASI_API: {
    label: '천문연 API',
    cls: 'bg-sky-50 text-sky-700 border-sky-200',
  },
  ADMIN_MANUAL: {
    label: '수동 등록',
    cls: 'bg-violet-50 text-violet-700 border-violet-200',
  },
  ICS_IMPORT: {
    label: 'ICS 가져오기',
    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  SEED: {
    label: '기본 시드',
    cls: 'bg-slate-100 text-slate-600 border-slate-200',
  },
};

export default function AdminHolidaysPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear);
  const [holidays, setHolidays] = useState<SystemHolidayDto[]>([]);
  const [settings, setSettings] = useState<HolidaySyncSettingsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  // 설정 폼 상태
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const [kasiApiKey, setKasiApiKey] = useState('');
  const [icsFeedUrl, setIcsFeedUrl] = useState('');

  // 공휴일 추가 모달
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newDate, setNewDate] = useState(`${currentYear}-01-01`);
  const [newName, setNewName] = useState('');
  const [newIsSubstitute, setNewIsSubstitute] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const icsInputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [list, syncCfg] = await Promise.all([
        adminHolidaysApi.listByYear(year),
        adminHolidaysApi.getSyncSettings(),
      ]);
      setHolidays(list || []);
      setSettings(syncCfg);
      setAutoSyncEnabled(syncCfg.autoSyncEnabled);
      setKasiApiKey(syncCfg.kasiApiKey);
      setIcsFeedUrl(syncCfg.icsFeedUrl);
    } catch (err: any) {
      console.error('Failed to load holiday data:', err);
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const updated = await adminHolidaysApi.saveSyncSettings({
        autoSyncEnabled,
        kasiApiKey,
        icsFeedUrl,
      });
      setSettings(updated);
      alert('공휴일 동기화 설정이 저장되었습니다.');
    } catch (err: any) {
      alert(err?.message || '설정 저장에 실패했습니다.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const res = await adminHolidaysApi.syncNow([year, year + 1]);
      alert(
        `${res.syncedYears.join(', ')}년 공휴일 동기화 완료 (반영: ${res.upserted}건, 수동 보호: ${res.skippedManual}건)`,
      );
      await loadData();
    } catch (err: any) {
      alert(err?.message || '공휴일 동기화에 실패했습니다.');
    } finally {
      setSyncing(false);
    }
  };

  const handleImportIcs = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const res = await adminHolidaysApi.importIcs(text);
      alert(`ICS 업로드 완료 (반영: ${res.upserted}건)`);
      await loadData();
    } catch (err: any) {
      alert(err?.message || 'ICS 가져오기에 실패했습니다.');
    } finally {
      if (icsInputRef.current) icsInputRef.current.value = '';
    }
  };

  const handleCreateHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newDate) return;
    setSubmitting(true);
    try {
      await adminHolidaysApi.create({
        holidayDate: newDate,
        name: newName.trim(),
        isSubstitute: newIsSubstitute,
      });
      setAddModalOpen(false);
      setNewName('');
      setNewIsSubstitute(false);
      await loadData();
    } catch (err: any) {
      alert(err?.message || '공휴일 등록에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (item: SystemHolidayDto) => {
    try {
      await adminHolidaysApi.update(item.id, { isActive: !item.isActive });
      await loadData();
    } catch (err: any) {
      alert(err?.message || '상태 변경에 실패했습니다.');
    }
  };

  const handleDelete = async (item: SystemHolidayDto) => {
    if (!confirm(`"${item.holidayDate} ${item.name}" 공휴일을 삭제하시겠습니까?`)) {
      return;
    }
    try {
      await adminHolidaysApi.delete(item.id);
      await loadData();
    } catch (err: any) {
      alert(err?.message || '공휴일 삭제에 실패했습니다.');
    }
  };

  const yearOptions = [
    currentYear - 1,
    currentYear,
    currentYear + 1,
    currentYear + 2,
    currentYear + 3,
  ];

  return (
    <div className="space-y-6">
      <input
        ref={icsInputRef}
        type="file"
        accept=".ics,text/calendar"
        onChange={handleImportIcs}
        className="hidden"
      />

      <PageHeader
        title="대한민국 공휴일 관리"
        icon={<CalendarDays className="h-6 w-6 text-indigo-600" />}
        subtitle="한국천문연구원 특일정보 API 자동 동기화 및 임시·대체공휴일을 관리합니다."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => icsInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs transition"
            >
              <Upload className="h-3.5 w-3.5 text-slate-500" />
              <span>.ics 일괄 업로드</span>
            </button>
            <button
              type="button"
              onClick={handleSyncNow}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 shadow-sm transition disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
              <span>{syncing ? '동기화 중...' : '천문연 API 즉시 동기화'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setNewDate(`${year}-01-01`);
                setAddModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700 shadow-sm transition"
            >
              <Plus className="h-4 w-4" />
              <span>공휴일 추가</span>
            </button>
          </div>
        }
      />

      {/* 동기화 설정 카드 */}
      <form
        onSubmit={handleSaveSettings}
        className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              자동 동기화 연동 설정 (1순위: 한국천문연구원 특일정보 API)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              마지막 동기화:{' '}
              <span className="font-medium text-slate-700">
                {settings?.lastSyncedAt
                  ? new Date(settings.lastSyncedAt).toLocaleString('ko-KR')
                  : '기록 없음'}
              </span>
              {settings?.lastSyncStatus && (
                <span className="ml-2 text-indigo-600">
                  ({settings.lastSyncStatus})
                </span>
              )}
            </p>
          </div>

          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoSyncEnabled}
              onChange={(e) => setAutoSyncEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-xs font-semibold text-slate-700">
              주기적 자동 동기화 사용
            </span>
          </label>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5">
              <KeyRound className="h-3.5 w-3.5 text-slate-400" />
              <span>공공데이터포털(KASI) API 인증키</span>
            </label>
            <input
              type="text"
              value={kasiApiKey}
              onChange={(e) => setKasiApiKey(e.target.value)}
              placeholder="Decoding 또는 Encoding ServiceKey"
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-mono text-slate-800 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5">
              <Globe className="h-3.5 w-3.5 text-slate-400" />
              <span>보조 ICS 피드 URL (선택 사항)</span>
            </label>
            <input
              type="url"
              value={icsFeedUrl}
              onChange={(e) => setIcsFeedUrl(e.target.value)}
              placeholder="https://.../ko.south_korea.official#holiday@group.v.calendar.google.com/public/basic.ics"
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={savingSettings}
            className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            <span>{savingSettings ? '저장 중...' : '연동 설정 저장'}</span>
          </button>
        </div>
      </form>

      {/* 연도별 공휴일 목록 */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-600">조회 연도:</span>
            <div className="inline-flex rounded-lg bg-slate-200/70 p-0.5">
              {yearOptions.map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => setYear(y)}
                  className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                    year === y
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {y}년
                </button>
              ))}
            </div>
          </div>
          <span className="text-xs text-slate-500">
            총 <strong className="text-slate-800">{holidays.length}</strong>건
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400">
            공휴일 목록을 불러오는 중입니다...
          </div>
        ) : holidays.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400">
            {year}년 공휴일 데이터가 없습니다. 상단의 &lsquo;천문연 API 즉시 동기화&rsquo; 또는 &lsquo;공휴일 추가&rsquo;를 이용해 주세요.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3 font-semibold">날짜</th>
                  <th className="px-5 py-3 font-semibold">공휴일명</th>
                  <th className="px-5 py-3 font-semibold">구분</th>
                  <th className="px-5 py-3 font-semibold">출처</th>
                  <th className="px-5 py-3 font-semibold">캘린더 노출</th>
                  <th className="px-5 py-3 font-semibold text-right">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {holidays.map((item) => {
                  const srcMeta = SOURCE_LABELS[item.source] || SOURCE_LABELS.SEED;
                  const dow = new Date(`${item.holidayDate}T00:00:00`).toLocaleDateString(
                    'ko-KR',
                    { weekday: 'short' },
                  );
                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-50/70 transition ${
                        !item.isActive ? 'opacity-50' : ''
                      }`}
                    >
                      <td className="px-5 py-3 font-mono font-semibold text-slate-800">
                        {item.holidayDate}{' '}
                        <span className="text-slate-400 font-sans">({dow})</span>
                      </td>
                      <td className="px-5 py-3 font-semibold text-slate-900">
                        {item.name}
                      </td>
                      <td className="px-5 py-3">
                        {item.isSubstitute ? (
                          <span className="rounded bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                            대체공휴일
                          </span>
                        ) : (
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                            법정/지정
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`rounded border px-2 py-0.5 text-[11px] font-medium ${srcMeta.cls}`}
                        >
                          {srcMeta.label}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <button
                          type="button"
                          onClick={() => handleToggleActive(item)}
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition ${
                            item.isActive
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-500 border border-slate-200'
                          }`}
                        >
                          {item.isActive ? (
                            <>
                              <CheckCircle2 className="h-3 w-3" />
                              <span>표시 중</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="h-3 w-3" />
                              <span>숨김</span>
                            </>
                          )}
                        </button>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleDelete(item)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                          title="삭제"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 공휴일 수동 등록 모달 */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
              <h3 className="text-base font-bold text-slate-900">
                공휴일 / 임시공휴일 등록
              </h3>
              <button
                type="button"
                onClick={() => setAddModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreateHoliday} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  날짜 *
                </label>
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  공휴일 명칭 *
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="예: 임시공휴일, 창립기념일"
                  required
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-800"
                />
              </div>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newIsSubstitute}
                  onChange={(e) => setNewIsSubstitute(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600"
                />
                <span className="text-xs font-medium text-slate-700">
                  대체공휴일 여부
                </span>
              </label>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-sky-600 px-5 py-2 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                >
                  {submitting ? '등록 중...' : '등록'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
