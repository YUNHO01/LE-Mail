'use client';

import React, { useState } from 'react';
import { X, Tag, Plus, Trash2, Edit2, Check } from 'lucide-react';
import { contactsApi } from '@/lib/api';
import { ContactGroupDto } from '@lemail/shared-types';

interface ContactGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  groups: ContactGroupDto[];
  onRefresh: () => void;
}

const PRESET_COLORS = [
  '#0284c7', // Sky
  '#10b981', // Emerald
  '#8b5cf6', // Violet
  '#f59e0b', // Amber
  '#ef4444', // Rose
  '#64748b', // Slate
];

export const ContactGroupModal: React.FC<ContactGroupModalProps> = ({
  isOpen,
  onClose,
  groups,
  onRefresh,
}) => {
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupColor, setNewGroupColor] = useState(PRESET_COLORS[0]);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;

    try {
      setLoading(true);
      setError(null);
      await contactsApi.createGroup({
        name: newGroupName.trim(),
        color: newGroupColor,
      });
      setNewGroupName('');
      onRefresh();
      window.dispatchEvent(new CustomEvent('contacts:refresh-groups'));
    } catch (err: any) {
      setError(err.message || '그룹 생성 실패');
    } finally {
      setLoading(false);
    }
  };

  const handleStartEdit = (g: ContactGroupDto) => {
    setEditingGroupId(g.id);
    setEditingGroupName(g.name);
  };

  const handleSaveEdit = async (id: string) => {
    if (!editingGroupName.trim()) return;
    try {
      setLoading(true);
      await contactsApi.updateGroup(id, { name: editingGroupName.trim() });
      setEditingGroupId(null);
      onRefresh();
      window.dispatchEvent(new CustomEvent('contacts:refresh-groups'));
    } catch (err: any) {
      setError(err.message || '그룹 수정 실패');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGroup = async (id: string, name: string) => {
    if (!confirm(`'${name}' 그룹을 삭제하시겠습니까?\n소속된 연락처는 미분류 상태로 유지됩니다.`)) {
      return;
    }
    try {
      setLoading(true);
      await contactsApi.deleteGroup(id);
      onRefresh();
      window.dispatchEvent(new CustomEvent('contacts:refresh-groups'));
    } catch (err: any) {
      setError(err.message || '그룹 삭제 실패');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
              <Tag className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">그룹 관리</h3>
              <p className="text-xs text-slate-400">연락처를 분류할 그룹을 추가하고 편집합니다.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {error && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 p-2.5 text-xs text-rose-600">
              {error}
            </div>
          )}

          {/* 새 그룹 생성 폼 */}
          <form onSubmit={handleCreateGroup} className="space-y-3">
            <label className="block text-xs font-semibold text-slate-700">새 그룹 추가</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="그룹명 입력"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-sky-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!newGroupName.trim() || loading}
                className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-500 transition disabled:opacity-50 flex items-center gap-1"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>추가</span>
              </button>
            </div>
            {/* 색상 선택 */}
            <div className="flex items-center gap-2 pt-1">
              <span className="text-[11px] text-slate-400">색상:</span>
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewGroupColor(c)}
                  className={`w-4 h-4 rounded-full transition-transform ${
                    newGroupColor === c ? 'scale-125 ring-2 ring-slate-400 ring-offset-1' : ''
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </form>

          {/* 그룹 목록 */}
          <div className="space-y-1.5 pt-2 border-t border-slate-100">
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              등록된 그룹 목록 ({groups.length})
            </label>
            {groups.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-400 bg-slate-50 rounded-xl">
                등록된 그룹이 없습니다.
              </div>
            ) : (
              <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                {groups.map((g) => (
                  <div
                    key={g.id}
                    className="flex items-center justify-between p-2 rounded-xl border border-slate-100 hover:bg-slate-50 transition text-xs"
                  >
                    {editingGroupId === g.id ? (
                      <div className="flex items-center gap-2 flex-1 mr-2">
                        <input
                          type="text"
                          value={editingGroupName}
                          onChange={(e) => setEditingGroupName(e.target.value)}
                          className="flex-1 rounded-lg border border-sky-400 px-2 py-1 text-xs focus:outline-none"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(g.id)}
                          className="p-1 rounded text-emerald-600 hover:bg-emerald-50"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingGroupId(null)}
                          className="p-1 rounded text-slate-400 hover:bg-slate-100"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 truncate">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: g.color || '#0284c7' }}
                          />
                          <span className="font-semibold text-slate-700 truncate">{g.name}</span>
                          <span className="text-[11px] text-slate-400 font-mono">
                            ({g.contactCount || 0}명)
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleStartEdit(g)}
                            className="p-1 text-slate-400 hover:text-slate-600 rounded transition"
                            title="그룹명 수정"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteGroup(g.id, g.name)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded transition"
                            title="그룹 삭제"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
