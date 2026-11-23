'use client';

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Building2,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  FolderTree,
  GripVertical,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { DepartmentDto } from '@lemail/shared-types';
import { DepartmentTreeNodeDto, orgApi } from '@/lib/api';
import { SelectDropdown, ToggleSwitch } from '@/components/common';

export interface DepartmentTreePanelHandle {
  openCreateModal: (parentId?: string) => void;
  reloadTree: () => Promise<void>;
}

interface DepartmentTreePanelProps {
  selectedDeptId: string | null; // null = 전체, 'unassigned' = 부서 미지정, uuid = 특정 부서
  onSelectDept: (deptId: string | null, deptName?: string) => void;
  onDepartmentsChanged?: () => void;
  onDropUsersToDept?: (userIds: string[], targetDept: DepartmentTreeNodeDto) => void | Promise<void>;
  onMessage?: (msg: { type: 'success' | 'error'; text: string }) => void;
}

export const DepartmentTreePanel = forwardRef<DepartmentTreePanelHandle, DepartmentTreePanelProps>(({
  selectedDeptId,
  onSelectDept,
  onDepartmentsChanged,
  onDropUsersToDept,
  onMessage,
}, ref) => {
  const [tree, setTree] = useState<DepartmentTreeNodeDto[]>([]);
  const [flatDepts, setFlatDepts] = useState<DepartmentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Drag & Drop state
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<DepartmentDto | null>(null);
  const [saving, setSaving] = useState(false);
  const [deptForm, setDeptForm] = useState({
    name: '',
    code: '',
    parentId: '',
    managerEmployeeId: '',
    isActive: true,
  });

  const loadTree = useCallback(async () => {
    setLoading(true);
    try {
      const [treeRes, flatRes] = await Promise.all([
        orgApi.getDepartmentTree(includeInactive),
        orgApi.getDepartments(includeInactive),
      ]);
      setTree(treeRes);
      setFlatDepts(flatRes);
      setExpandedIds((prev) => {
        if (prev.size > 0) return prev;
        return new Set(flatRes.map((d) => d.id));
      });
    } catch (err: any) {
      onMessage?.({ type: 'error', text: err?.message || '부서 트리를 불러오지 못했습니다.' });
    } finally {
      setLoading(false);
    }
  }, [includeInactive, onMessage]);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  const rootDept = useMemo(
    () => flatDepts.find((d) => d.isRoot) || flatDepts.find((d) => !d.parentId) || null,
    [flatDepts],
  );

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openCreateModal = (parentId?: string) => {
    const defaultParent =
      parentId ||
      (selectedDeptId && selectedDeptId !== 'unassigned' ? selectedDeptId : rootDept?.id || '');
    setEditingDept(null);
    setDeptForm({
      name: '',
      code: '',
      parentId: defaultParent,
      managerEmployeeId: '',
      isActive: true,
    });
    setModalOpen(true);
  };

  useImperativeHandle(ref, () => ({
    openCreateModal,
    reloadTree: loadTree,
  }));

  const openEditModal = (dept: DepartmentDto, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingDept(dept);
    setDeptForm({
      name: dept.name,
      code: dept.code || '',
      parentId: dept.parentId || '',
      managerEmployeeId: dept.managerEmployeeId || '',
      isActive: dept.isActive,
    });
    setModalOpen(true);
  };

  const handleSaveDept = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingDept) {
        await orgApi.updateDepartment(editingDept.id, {
          ...(editingDept.isRoot ? {} : { name: deptForm.name.trim() }),
          code: deptForm.code.trim() || null,
          ...(editingDept.isRoot ? {} : { parentId: deptForm.parentId || null }),
          managerEmployeeId: deptForm.managerEmployeeId.trim() || null,
          ...(editingDept.isRoot ? {} : { isActive: deptForm.isActive }),
        });
        onMessage?.({ type: 'success', text: '부서 정보가 수정되었습니다.' });
      } else {
        await orgApi.createDepartment({
          name: deptForm.name.trim(),
          code: deptForm.code.trim() || null,
          parentId: deptForm.parentId || null,
          managerEmployeeId: deptForm.managerEmployeeId.trim() || null,
          isActive: deptForm.isActive,
        });
        onMessage?.({ type: 'success', text: '새 부서가 등록되었습니다.' });
      }
      setModalOpen(false);
      await loadTree();
      onDepartmentsChanged?.();
    } catch (err: any) {
      onMessage?.({ type: 'error', text: err?.message || '부서 저장에 실패했습니다.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDept = async (dept: DepartmentDto, e: React.MouseEvent) => {
    e.stopPropagation();
    if (dept.isRoot) return;
    if (!confirm(`'${dept.name}' 부서를 삭제하시겠습니까?`)) return;
    try {
      await orgApi.deleteDepartment(dept.id);
      onMessage?.({ type: 'success', text: `'${dept.name}' 부서가 삭제되었습니다.` });
      if (selectedDeptId === dept.id) {
        onSelectDept(null);
      }
      await loadTree();
      onDepartmentsChanged?.();
    } catch (err: any) {
      onMessage?.({ type: 'error', text: err?.message || '부서 삭제에 실패했습니다.' });
    }
  };

  const handleReorderSibling = async (
    node: DepartmentTreeNodeDto,
    siblings: DepartmentTreeNodeDto[],
    direction: 'up' | 'down',
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    if (node.isRoot) return;
    const currentIndex = siblings.findIndex((s) => s.id === node.id);
    if (currentIndex < 0) return;
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= siblings.length) return;

    try {
      await orgApi.moveDepartment(node.id, {
        targetParentId: node.parentId,
        targetIndex,
      });
      await loadTree();
      onDepartmentsChanged?.();
    } catch (err: any) {
      onMessage?.({ type: 'error', text: err?.message || '부서 순서 변경에 실패했습니다.' });
    }
  };

  const handleDropOnNode = async (targetNode: DepartmentTreeNodeDto, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverId(null);

    // 1. 사용자 목록에서 드래그한 경우 → 해당 부서로 사용자 이동
    const userIdsRaw = e.dataTransfer.getData('application/lemail-user-ids');
    if (userIdsRaw) {
      try {
        const userIds = JSON.parse(userIdsRaw);
        if (Array.isArray(userIds) && userIds.length > 0) {
          await onDropUsersToDept?.(userIds, targetNode);
        }
      } catch {
        onMessage?.({ type: 'error', text: '사용자 이동 데이터를 처리하지 못했습니다.' });
      }
      return;
    }

    // 2. 부서 트리 내 부서 이동
    if (!draggedId || draggedId === targetNode.id) {
      setDraggedId(null);
      return;
    }

    const draggedDept = flatDepts.find((d) => d.id === draggedId);
    setDraggedId(null);
    if (!draggedDept || draggedDept.isRoot) return;

    // 하위 부서로 드롭 방지 (클라이언트 사전 체크)
    if (targetNode.path && draggedDept.path && targetNode.path.startsWith(`${draggedDept.path}/`)) {
      onMessage?.({ type: 'error', text: '하위 부서로 이동할 수 없습니다.' });
      return;
    }

    try {
      await orgApi.moveDepartment(draggedDept.id, {
        targetParentId: targetNode.id,
      });
      setExpandedIds((prev) => new Set([...prev, targetNode.id]));
      onMessage?.({
        type: 'success',
        text: `'${draggedDept.name}' 부서를 '${targetNode.name}' 하위로 이동했습니다.`,
      });
      await loadTree();
      onDepartmentsChanged?.();
    } catch (err: any) {
      onMessage?.({ type: 'error', text: err?.message || '부서 이동에 실패했습니다.' });
    }
  };

  // 수정 모달에서 선택 가능한 상위 부서 (자기 자신 및 하위 부서 제외)
  const selectableParents = useMemo(() => {
    if (!editingDept) return flatDepts;
    return flatDepts.filter((d) => {
      if (d.id === editingDept.id) return false;
      if (editingDept.path && d.path && d.path.startsWith(`${editingDept.path}/`)) return false;
      return true;
    });
  }, [flatDepts, editingDept]);

  const renderNodes = (nodes: DepartmentTreeNodeDto[], level = 0): React.ReactNode => {
    return nodes.map((node, index) => {
      const hasChildren = node.children && node.children.length > 0;
      const isExpanded = expandedIds.has(node.id);
      const isSelected = selectedDeptId === node.id;
      const isDragOver = dragOverId === node.id && draggedId !== node.id;

      return (
        <div key={node.id}>
          <div
            draggable={!node.isRoot}
            onDragStart={(e) => {
              if (node.isRoot) return;
              setDraggedId(node.id);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragEnd={() => {
              setDraggedId(null);
              setDragOverId(null);
            }}
            onDragOver={(e) => {
              const isUserDrag = e.dataTransfer.types.includes('application/lemail-user-ids');
              const isDeptDrag = Boolean(draggedId) && draggedId !== node.id;
              if (!isUserDrag && !isDeptDrag) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setDragOverId(node.id);
            }}
            onDragLeave={() => {
              if (dragOverId === node.id) setDragOverId(null);
            }}
            onDrop={(e) => handleDropOnNode(node, e)}
            onClick={() => onSelectDept(node.id, node.name)}
            style={{ paddingLeft: `${10 + level * 16}px` }}
            className={`group flex items-center justify-between gap-1.5 pr-2 py-2 border-b border-slate-100 cursor-pointer transition-colors ${
              isDragOver
                ? 'bg-sky-100/80 ring-1 ring-inset ring-sky-400'
                : isSelected
                ? 'bg-sky-50 text-sky-900'
                : 'hover:bg-slate-50/90 text-slate-700'
            } ${!node.isActive ? 'opacity-60' : ''}`}
          >
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              {!node.isRoot ? (
                <GripVertical className="h-3.5 w-3.5 text-slate-300 group-hover:text-slate-400 shrink-0 cursor-grab" />
              ) : (
                <span className="w-3.5 shrink-0" />
              )}

              {hasChildren ? (
                <button
                  type="button"
                  onClick={(e) => toggleExpand(node.id, e)}
                  className="p-0.5 rounded hover:bg-slate-200/80 text-slate-500 shrink-0"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                </button>
              ) : (
                <span className="w-4.5 inline-block shrink-0" />
              )}

              {node.isRoot ? (
                <Building2 className="h-3.5 w-3.5 shrink-0 text-amber-600" />
              ) : hasChildren && isExpanded ? (
                <FolderOpen
                  className={`h-3.5 w-3.5 shrink-0 ${
                    isSelected ? 'text-sky-600' : 'text-sky-500/80'
                  }`}
                />
              ) : (
                <Folder
                  className={`h-3.5 w-3.5 shrink-0 ${
                    isSelected ? 'text-sky-600' : 'text-slate-400'
                  }`}
                />
              )}

              <span
                className={`text-xs truncate ${
                  node.isRoot || isSelected ? 'font-bold text-slate-900' : 'font-medium'
                }`}
                title={node.name}
              >
                {node.name}
              </span>

              {node.isRoot && (
                <span className="shrink-0 rounded bg-amber-50 px-1 py-0.5 text-[9px] font-semibold text-amber-700 border border-amber-200">
                  회사
                </span>
              )}

              <span className="shrink-0 text-[10px] text-slate-400 font-mono">
                ({node.userCount})
              </span>
            </div>

            {/* Hover / Selected Actions */}
            <div
              className={`flex items-center gap-0.5 shrink-0 ${
                isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              } transition-opacity`}
            >
              {!node.isRoot && (
                <>
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={(e) => handleReorderSibling(node, nodes, 'up', e)}
                    title="위로 이동"
                    className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 disabled:opacity-30 disabled:pointer-events-none"
                  >
                    <ArrowUp className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    disabled={index === nodes.length - 1}
                    onClick={(e) => handleReorderSibling(node, nodes, 'down', e)}
                    title="아래로 이동"
                    className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 disabled:opacity-30 disabled:pointer-events-none"
                  >
                    <ArrowDown className="h-3 w-3" />
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openCreateModal(node.id);
                }}
                title="하위 부서 추가"
                className="p-1 rounded text-slate-400 hover:text-sky-600 hover:bg-sky-100/70"
              >
                <Plus className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={(e) => openEditModal(node, e)}
                title={node.isRoot ? '부서 정보 보기/수정' : '부서 수정 및 이동'}
                className="p-1 rounded text-slate-400 hover:text-sky-600 hover:bg-sky-100/70"
              >
                <Pencil className="h-3 w-3" />
              </button>
              {!node.isRoot && (
                <button
                  type="button"
                  onClick={(e) => handleDeleteDept(node, e)}
                  title="부서 삭제"
                  className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-100/70"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
          {hasChildren && isExpanded && renderNodes(node.children, level + 1)}
        </div>
      );
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden flex flex-col min-h-[620px]">
      {/* 1단 헤더 (우측 카드 헤더와 동일한 h-12 규격) */}
      <div className="h-12 px-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <FolderTree className="h-4 w-4 text-sky-600 shrink-0" />
          <span className="text-xs font-bold text-slate-900 truncate">부서 정보</span>
          <span className="rounded-full bg-slate-200/70 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 font-mono">
            {flatDepts.length}
          </span>
        </div>
        <button
          type="button"
          onClick={loadTree}
          disabled={loading}
          title="부서 트리 새로고침"
          className="btn btn-sm btn-secondary p-1.5 text-slate-500 hover:text-slate-800"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* 2단 필터 바 (우측 툴바와 동일한 h-11 규격) */}
      <div className="h-11 px-3 border-b border-slate-100 bg-white flex items-center justify-between gap-2 text-[11px] shrink-0">
        <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
          <button
            type="button"
            onClick={() => onSelectDept(null)}
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
            onClick={() => onSelectDept('unassigned', '부서 미지정')}
            className={`px-2 py-1 rounded-md font-medium transition-colors ${
              selectedDeptId === 'unassigned'
                ? 'bg-white text-sky-700 shadow-2xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            미지정
          </button>
        </div>
        <div className="flex items-center text-slate-600">
          <ToggleSwitch
            checked={includeInactive}
            onChange={setIncludeInactive}
            label="비활성"
            showStatusText={false}
            size="sm"
            color="indigo"
          />
        </div>
      </div>

      {/* Tree Body */}
      <div className="flex-1 overflow-y-auto max-h-[580px]">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">부서 트리를 불러오는 중...</div>
        ) : tree.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            <Users className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            등록된 부서가 없습니다.
          </div>
        ) : (
          <div>{renderNodes(tree)}</div>
        )}
      </div>

      {/* 부서 등록/수정 모달 */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">
                {editingDept ? '부서 수정' : '새 부서 등록'}
              </h3>
              <button type="button" onClick={() => setModalOpen(false)}>
                <X className="h-4 w-4 text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleSaveDept} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">부서명 *</label>
                <input
                  type="text"
                  required
                  disabled={Boolean(editingDept?.isRoot)}
                  value={deptForm.name}
                  onChange={(e) => setDeptForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-500"
                  placeholder="예: 플랫폼개발팀"
                />
                {editingDept?.isRoot && (
                  <p className="mt-1 text-[11px] text-amber-600">
                    최상위 부서명은 라이선스 회사명과 연동되며 직접 변경할 수 없습니다.
                  </p>
                )}
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
                  <label className="block text-xs font-semibold text-slate-700 mb-1">부서장 사번</label>
                  <input
                    type="text"
                    value={deptForm.managerEmployeeId}
                    onChange={(e) => setDeptForm((p) => ({ ...p, managerEmployeeId: e.target.value }))}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    placeholder="예: EMP1001"
                  />
                </div>
              </div>

              {!editingDept?.isRoot && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">상위 부서 (부서 이동)</label>
                  <SelectDropdown
                    options={selectableParents.map((d) => ({
                      value: d.id,
                      label: `${'— '.repeat(d.depth)}${d.name}${d.isRoot ? ' (최상위)' : ''}`,
                    }))}
                    value={deptForm.parentId}
                    onChange={(val) => setDeptForm((p) => ({ ...p, parentId: val }))}
                    headerLabel="상위 부서 선택"
                    size="md"
                    fullWidth
                  />
                </div>
              )}

              {!editingDept?.isRoot && (
                <ToggleSwitch
                  checked={deptForm.isActive}
                  onChange={(val) => setDeptForm((p) => ({ ...p, isActive: val }))}
                  label="활성 부서로 사용"
                  showStatusText={false}
                  color="indigo"
                />
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
                >
                  {saving ? '저장 중...' : '저장'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
});

DepartmentTreePanel.displayName = 'DepartmentTreePanel';
