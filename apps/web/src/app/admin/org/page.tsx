'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Building2,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  UploadCloud,
  ChevronRight,
  ChevronDown,
  Users,
  CheckCircle2,
  AlertCircle,
  X,
  Settings,
  DownloadCloud,
  Save,
} from 'lucide-react';
import { DepartmentDto } from '@lemail/shared-types';
import { PageHeader, ToggleSwitch } from '@/components/common';
import { DepartmentTreeNodeDto, orgApi, OrgSyncLogDto } from '@/lib/api';

const SAMPLE_AMS_PAYLOAD = JSON.stringify(
  {
    syncType: 'FULL',
    autoProvisionMailbox: true,
    departments: [
      { amsDeptId: 'AMS-HQ', code: 'HQ', name: '본사', sortOrder: 0, isActive: true },
      { amsDeptId: 'AMS-DEV', code: 'DEV', parentAmsDeptId: 'AMS-HQ', name: '개발본부', sortOrder: 1, isActive: true },
    ],
    employees: [
      {
        employeeNumber: 'EMP1001',
        name: '홍길동',
        email: 'hong@lineedge.com',
        amsDeptId: 'AMS-DEV',
        position: '과장',
        jobTitle: '팀장',
        phone: '02-1234-5678',
        employmentStatus: 'ACTIVE',
        mailEnabled: true,
      },
    ],
  },
  null,
  2,
);

export default function AdminOrgPage() {
  const [tree, setTree] = useState<DepartmentTreeNodeDto[]>([]);
  const [flatDepts, setFlatDepts] = useState<DepartmentDto[]>([]);
  const [syncLogs, setSyncLogs] = useState<OrgSyncLogDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 부서 모달 상태
  const [deptModalOpen, setDeptModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<DepartmentDto | null>(null);
  const [deptForm, setDeptForm] = useState({
    name: '',
    code: '',
    parentId: '',
    sortOrder: 0,
    managerEmployeeId: '',
    isActive: true,
  });
  const [savingDept, setSavingDept] = useState(false);

  // AMS 동기화 모달 상태
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncJson, setSyncJson] = useState(SAMPLE_AMS_PAYLOAD);
  const [syncing, setSyncing] = useState(false);

  // AMS 연동 설정 상태
  const [syncSettings, setSyncSettings] = useState({
    enabled: false,
    apiUrl: '',
    apiToken: '',
    hasApiToken: false,
    intervalMinutes: 60,
    autoProvisionMailbox: true,
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [pulling, setPulling] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [treeRes, flatRes, logsRes, settingsRes] = await Promise.all([
        orgApi.getDepartmentTree(includeInactive),
        orgApi.getDepartments(includeInactive),
        orgApi.getSyncLogs(15),
        orgApi.getSyncSettings(),
      ]);
      setTree(treeRes);
      setFlatDepts(flatRes);
      setSyncLogs(logsRes);
      setSyncSettings((prev) => ({
        ...prev,
        enabled: settingsRes.enabled,
        apiUrl: settingsRes.apiUrl,
        hasApiToken: settingsRes.hasApiToken,
        intervalMinutes: settingsRes.intervalMinutes,
        autoProvisionMailbox: settingsRes.autoProvisionMailbox,
        apiToken: '',
      }));
      setExpandedIds((prev) => {
        if (prev.size > 0) return prev;
        return new Set(flatRes.map((d) => d.id));
      });
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || '조직도 정보를 불러오지 못했습니다.' });
    } finally {
      setLoading(false);
    }
  }, [includeInactive]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openCreateModal = (parentId = '') => {
    setEditingDept(null);
    setDeptForm({
      name: '',
      code: '',
      parentId,
      sortOrder: 0,
      managerEmployeeId: '',
      isActive: true,
    });
    setDeptModalOpen(true);
  };

  const openEditModal = (dept: DepartmentDto) => {
    setEditingDept(dept);
    setDeptForm({
      name: dept.name,
      code: dept.code || '',
      parentId: dept.parentId || '',
      sortOrder: dept.sortOrder ?? 0,
      managerEmployeeId: dept.managerEmployeeId || '',
      isActive: dept.isActive,
    });
    setDeptModalOpen(true);
  };

  const handleSaveDept = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingDept(true);
    setMessage(null);
    try {
      const payload = {
        name: deptForm.name.trim(),
        code: deptForm.code.trim() || null,
        parentId: deptForm.parentId || null,
        sortOrder: Number(deptForm.sortOrder) || 0,
        managerEmployeeId: deptForm.managerEmployeeId.trim() || null,
        isActive: deptForm.isActive,
      };
      if (editingDept) {
        await orgApi.updateDepartment(editingDept.id, payload);
        setMessage({ type: 'success', text: '부서 정보가 수정되었습니다.' });
      } else {
        await orgApi.createDepartment(payload);
        setMessage({ type: 'success', text: '새 부서가 등록되었습니다.' });
      }
      setDeptModalOpen(false);
      await loadData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || '부서 저장에 실패했습니다.' });
    } finally {
      setSavingDept(false);
    }
  };

  const handleDeleteDept = async (dept: DepartmentDto) => {
    if (!confirm(`'${dept.name}' 부서를 삭제하시겠습니까?`)) return;
    setMessage(null);
    try {
      await orgApi.deleteDepartment(dept.id);
      setMessage({ type: 'success', text: `'${dept.name}' 부서가 삭제되었습니다.` });
      await loadData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || '부서 삭제에 실패했습니다.' });
    }
  };

  const handleRunAmsSync = async (e: React.FormEvent) => {
    e.preventDefault();
    setSyncing(true);
    setMessage(null);
    try {
      const parsed = JSON.parse(syncJson);
      const res = await orgApi.syncAms(parsed);
      setMessage({
        type: res.status === 'FAILED' ? 'error' : 'success',
        text: `AMS 동기화 완료 (${res.status}) — 생성 ${res.createdCount}, 수정 ${res.updatedCount}, 비활성화 ${res.deactivatedCount}, 스킵 ${res.skippedCount}`,
      });
      setSyncModalOpen(false);
      await loadData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'AMS 동기화 실행에 실패했습니다.' });
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveSyncSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setMessage(null);
    try {
      const updated = await orgApi.updateSyncSettings({
        enabled: syncSettings.enabled,
        apiUrl: syncSettings.apiUrl.trim(),
        apiToken: syncSettings.apiToken.trim() || undefined,
        intervalMinutes: Number(syncSettings.intervalMinutes) || 60,
        autoProvisionMailbox: syncSettings.autoProvisionMailbox,
      });
      setSyncSettings((prev) => ({
        ...prev,
        enabled: updated.enabled,
        apiUrl: updated.apiUrl,
        hasApiToken: updated.hasApiToken,
        intervalMinutes: updated.intervalMinutes,
        autoProvisionMailbox: updated.autoProvisionMailbox,
        apiToken: '',
      }));
      setMessage({
        type: 'success',
        text: updated.enabled
          ? `AMS 자동 동기화 설정이 저장되었습니다. (${updated.intervalMinutes}분 주기)`
          : 'AMS 연동 설정이 저장되었습니다. (자동 동기화 비활성화 / 단독 운영 모드)',
      });
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'AMS 연동 설정 저장에 실패했습니다.' });
    } finally {
      setSavingSettings(false);
    }
  };

  const handlePullFromAms = async () => {
    setPulling(true);
    setMessage(null);
    try {
      const res = await orgApi.pullAms();
      setMessage({
        type: res.status === 'FAILED' ? 'error' : 'success',
        text: `AMS 즉시 가져오기 완료 (${res.status}) — 생성 ${res.createdCount}, 수정 ${res.updatedCount}, 비활성화 ${res.deactivatedCount}, 스킵 ${res.skippedCount}`,
      });
      await loadData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'AMS API 가져오기에 실패했습니다.' });
    } finally {
      setPulling(false);
    }
  };

  const renderTreeNodes = (nodes: DepartmentTreeNodeDto[], level = 0): React.ReactNode => {
    return nodes.map((node) => {
      const hasChildren = node.children && node.children.length > 0;
      const isExpanded = expandedIds.has(node.id);
      return (
        <div key={node.id}>
          <div
            className={`flex items-center justify-between px-4 py-2.5 border-b border-slate-100 hover:bg-slate-50/80 transition-colors ${
              !node.isActive ? 'opacity-60 bg-slate-50' : ''
            }`}
            style={{ paddingLeft: `${16 + level * 24}px` }}
          >
            <div className="flex items-center gap-2 min-w-0">
              {hasChildren ? (
                <button
                  type="button"
                  onClick={() => toggleExpand(node.id)}
                  className="p-0.5 rounded hover:bg-slate-200 text-slate-500"
                >
                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
              ) : (
                <span className="w-5 inline-block" />
              )}
              <Building2 className="h-4 w-4 text-indigo-600 shrink-0" />
              <span className="text-sm font-semibold text-slate-900 truncate">{node.name}</span>
              {node.code && (
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-mono text-slate-600">
                  {node.code}
                </span>
              )}
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  node.source === 'AMS'
                    ? 'bg-sky-50 text-sky-700 border border-sky-200'
                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                }`}
              >
                {node.source}
              </span>
              {!node.isActive && (
                <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 border border-rose-200">
                  비활성
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                <Users className="h-3.5 w-3.5" />
                {node.userCount}명
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => openCreateModal(node.id)}
                  title="하위 부서 추가"
                  className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => openEditModal(node)}
                  title="부서 수정"
                  className="p-1.5 rounded-lg text-slate-500 hover:text-sky-600 hover:bg-sky-50"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteDept(node)}
                  title="부서 삭제"
                  className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
          {hasChildren && isExpanded && renderTreeNodes(node.children, level + 1)}
        </div>
      );
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="조직도 및 AMS 연동"
        icon={<Building2 className="h-6 w-6 text-indigo-600" />}
        subtitle="단독 운영 시 사내 부서를 직접 관리하거나, AMS 조직도 데이터를 동기화합니다."
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSyncModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
            >
              <UploadCloud className="h-4 w-4" />
              <span>AMS 동기화 실행</span>
            </button>
            <button
              type="button"
              onClick={() => openCreateModal('')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
            >
              <Plus className="h-4 w-4" />
              <span>부서 추가</span>
            </button>
          </div>
        }
      />

      {message && (
        <div
          className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {message.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-600" />
            )}
            <span>{message.text}</span>
          </div>
          <button type="button" onClick={() => setMessage(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* AMS 연동 및 자동 동기화 설정 카드 */}
      <form
        onSubmit={handleSaveSyncSettings}
        className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-200 bg-slate-50/70">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-indigo-600" />
            <span className="text-sm font-bold text-slate-900">AMS 연동 및 자동 동기화 설정</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                syncSettings.enabled
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-slate-100 text-slate-600 border border-slate-200'
              }`}
            >
              {syncSettings.enabled ? `자동 동기화 활성 (${syncSettings.intervalMinutes}분)` : '단독 운영 (자동 동기화 꺼짐)'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePullFromAms}
              disabled={pulling || !syncSettings.apiUrl}
              className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-50"
            >
              <DownloadCloud className="h-3.5 w-3.5" />
              <span>{pulling ? '가져오는 중...' : '지금 가져오기 (Pull)'}</span>
            </button>
            <button
              type="submit"
              disabled={savingSettings}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              <span>{savingSettings ? '저장 중...' : '설정 저장'}</span>
            </button>
          </div>
        </div>

        <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              AMS 조직도 API URL
            </label>
            <input
              type="url"
              autoComplete="off"
              value={syncSettings.apiUrl}
              onChange={(e) => setSyncSettings((p) => ({ ...p, apiUrl: e.target.value }))}
              placeholder="https://ams.company.com/api/org/export"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-mono"
            />
          </div>

          <div>
            <label className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1">
              <span>API 인증 토큰 (Bearer)</span>
              {syncSettings.hasApiToken && (
                <span className="text-[10px] font-medium text-emerald-600">등록됨</span>
              )}
            </label>
            <input
              type="password"
              autoComplete="new-password"
              value={syncSettings.apiToken}
              onChange={(e) => setSyncSettings((p) => ({ ...p, apiToken: e.target.value }))}
              placeholder={syncSettings.hasApiToken ? '변경 시에만 새 토큰 입력' : 'Bearer 토큰 입력'}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              자동 동기화 주기 (분, 최소 5분)
            </label>
            <input
              type="number"
              min={5}
              max={1440}
              value={syncSettings.intervalMinutes}
              onChange={(e) =>
                setSyncSettings((p) => ({ ...p, intervalMinutes: Number(e.target.value) || 60 }))
              }
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
            />
          </div>

          <div className="md:col-span-2 lg:col-span-4 flex flex-wrap items-center gap-6 pt-1">
            <ToggleSwitch
              checked={syncSettings.enabled}
              onChange={(val) => setSyncSettings((p) => ({ ...p, enabled: val }))}
              label="AMS 자동 동기화 스케줄러 활성화 (해제 시 LEMail 단독 운영 모드)"
              color="indigo"
            />
            <ToggleSwitch
              checked={syncSettings.autoProvisionMailbox}
              onChange={(val) => setSyncSettings((p) => ({ ...p, autoProvisionMailbox: val }))}
              label="신규 입사자 LEMail 계정 및 사서함 자동 생성 (라이선스 정원 내)"
              color="indigo"
            />
          </div>
        </div>
      </form>

      {/* 조직도 트리 카드 */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50/70">
          <div className="text-sm font-bold text-slate-900">
            부서 계층 구조 ({flatDepts.length}개)
          </div>
          <div className="flex items-center gap-3">
            <ToggleSwitch
              checked={includeInactive}
              onChange={setIncludeInactive}
              label="비활성 부서 포함"
              size="sm"
              color="indigo"
            />
            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200/70"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-slate-400">조직도를 불러오는 중...</div>
        ) : tree.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            등록된 부서가 없습니다. <strong>부서 추가</strong> 또는 <strong>AMS 동기화 실행</strong>으로 조직도를 구성해 주세요.
          </div>
        ) : (
          <div>{renderTreeNodes(tree)}</div>
        )}
      </div>

      {/* AMS 동기화 이력 */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 text-sm font-bold text-slate-900">
          최근 AMS 동기화 이력
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-4 py-2.5 font-semibold">유형</th>
                <th className="px-4 py-2.5 font-semibold">상태</th>
                <th className="px-4 py-2.5 font-semibold">총/생성/수정/비활성/스킵</th>
                <th className="px-4 py-2.5 font-semibold">시작 시각</th>
                <th className="px-4 py-2.5 font-semibold">비고(오류/스킵 사유)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {syncLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                    동기화 실행 이력이 없습니다.
                  </td>
                </tr>
              ) : (
                syncLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2.5 font-medium text-slate-700">{log.syncType}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          log.status === 'SUCCESS'
                            ? 'bg-emerald-50 text-emerald-700'
                            : log.status === 'PARTIAL'
                            ? 'bg-amber-50 text-amber-700'
                            : log.status === 'FAILED'
                            ? 'bg-rose-50 text-rose-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 font-mono">
                      {log.totalCount} / +{log.createdCount} / ~{log.updatedCount} / -{log.deactivatedCount} / !{log.skippedCount}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {new Date(log.startedAt).toLocaleString('ko-KR')}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 max-w-md truncate" title={log.errorSummary || ''}>
                      {log.errorSummary || '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 부서 등록/수정 모달 */}
      {deptModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">
                {editingDept ? '부서 수정' : '새 부서 등록'}
              </h3>
              <button type="button" onClick={() => setDeptModalOpen(false)}>
                <X className="h-4 w-4 text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleSaveDept} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">부서명 *</label>
                <input
                  type="text"
                  required
                  value={deptForm.name}
                  onChange={(e) => setDeptForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  placeholder="예: 플랫폼개발팀"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">부서 코드</label>
                  <input
                    type="text"
                    value={deptForm.code}
                    onChange={(e) => setDeptForm((p) => ({ ...p, code: e.target.value }))}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    placeholder="예: DEV_01"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">정렬 순서</label>
                  <input
                    type="number"
                    min={0}
                    value={deptForm.sortOrder}
                    onChange={(e) => setDeptForm((p) => ({ ...p, sortOrder: Number(e.target.value) }))}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">상위 부서</label>
                <select
                  value={deptForm.parentId}
                  onChange={(e) => setDeptForm((p) => ({ ...p, parentId: e.target.value }))}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white"
                >
                  <option value="">최상위 부서 (없음)</option>
                  {flatDepts
                    .filter((d) => !editingDept || d.id !== editingDept.id)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {'— '.repeat(d.depth)}
                        {d.name}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">부서장 사번</label>
                <input
                  type="text"
                  value={deptForm.managerEmployeeId}
                  onChange={(e) => setDeptForm((p) => ({ ...p, managerEmployeeId: e.target.value }))}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  placeholder="예: EMP1001"
                />
              </div>
              <ToggleSwitch
                checked={deptForm.isActive}
                onChange={(val) => setDeptForm((p) => ({ ...p, isActive: val }))}
                label="활성 부서로 사용"
                color="indigo"
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDeptModalOpen(false)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={savingDept}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {savingDept ? '저장 중...' : '저장'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AMS 동기화 실행 모달 */}
      {syncModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">AMS 조직도 동기화 실행</h3>
              <button type="button" onClick={() => setSyncModalOpen(false)}>
                <X className="h-4 w-4 text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleRunAmsSync} className="p-5 space-y-4">
              <p className="text-xs text-slate-500 leading-relaxed">
                AMS 조직도 JSON 페이로드(`POST /api/org/sync/ams`)를 실행합니다. `employeeNumber`를 유니크 키로 매핑하며,
                퇴사(`RESIGNED`)/휴직(`ON_LEAVE`) 계정은 사서함이 비활성화되어 메일 백업(`mail_backup`)으로 대응할 수 있습니다.
              </p>
              <textarea
                rows={14}
                value={syncJson}
                onChange={(e) => setSyncJson(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-3 font-mono text-xs text-slate-800"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSyncModalOpen(false)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={syncing}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {syncing ? '동기화 실행 중...' : '동기화 실행'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
