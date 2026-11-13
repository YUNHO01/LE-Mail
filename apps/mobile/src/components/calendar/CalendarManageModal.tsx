'use client';

import React, { useState, useEffect } from 'react';
import { X, Palette, Trash2 } from 'lucide-react';
import { CalendarDto, CreateCalendarDto, UpdateCalendarDto } from '@lemail/shared-types';
import { CALENDAR_COLORS } from './dateUtils';
import { ToggleSwitch } from '../common';

interface CalendarManageModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCalendar?: CalendarDto | null;
  onSave: (
    payload: CreateCalendarDto | UpdateCalendarDto,
    calendarId?: string,
  ) => Promise<void>;
  onDelete?: (calendarId: string) => Promise<void>;
}

export const CalendarManageModal: React.FC<CalendarManageModalProps> = ({
  isOpen,
  onClose,
  initialCalendar,
  onSave,
  onDelete,
}) => {
  const isEdit = Boolean(initialCalendar);
  const [name, setName] = useState('');
  const [color, setColor] = useState(CALENDAR_COLORS[0]);
  const [isShared, setIsShared] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    if (initialCalendar) {
      setName(initialCalendar.name);
      setColor(initialCalendar.color || CALENDAR_COLORS[0]);
      setIsShared(initialCalendar.type === 'SHARED');
    } else {
      setName('');
      setColor(CALENDAR_COLORS[0]);
      setIsShared(false);
    }
  }, [isOpen, initialCalendar]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('캘린더 이름을 입력해 주세요.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onSave(
        {
          name: name.trim(),
          color,
          type: isShared ? 'SHARED' : 'PERSONAL',
        },
        initialCalendar?.id,
      );
      onClose();
    } catch (err: any) {
      setError(err?.message || '캘린더 저장 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!initialCalendar || !onDelete) return;
    if (!confirm(`"${initialCalendar.name}" 캘린더와 포함된 모든 일정을 삭제하시겠습니까?`)) {
      return;
    }
    setSubmitting(true);
    try {
      await onDelete(initialCalendar.id);
      onClose();
    } catch (err: any) {
      setError(err?.message || '캘린더 삭제 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-violet-600" />
            <h2 className="text-base font-bold text-slate-900">
              {isEdit ? '캘린더 수정' : '새 캘린더 만들기'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/70 hover:text-slate-600 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs font-medium text-rose-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              캘린더 이름 *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 프로젝트, 개인 일정"
              autoFocus
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              색상 선택
            </label>
            <div className="flex flex-wrap gap-2.5">
              {CALENDAR_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-7 w-7 rounded-full transition-transform ${
                    color === c ? 'ring-2 ring-offset-2 ring-slate-800 scale-110' : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={`색상 ${c}`}
                />
              ))}
            </div>
          </div>

          {!initialCalendar?.isDefault && initialCalendar?.type !== 'HOLIDAY' && (
            <div className="pt-1">
              <ToggleSwitch
                checked={isShared}
                onChange={setIsShared}
                label="사내 구성원 전체에게 공유 (읽기 전용)"
                color="sky"
              />
            </div>
          )}

          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            <div>
              {isEdit && !initialCalendar?.isDefault && onDelete && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>삭제</span>
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl bg-sky-600 px-5 py-2 text-xs font-semibold text-white hover:bg-sky-700 shadow-sm transition disabled:opacity-50"
              >
                {submitting ? '저장 중...' : isEdit ? '저장' : '만들기'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
