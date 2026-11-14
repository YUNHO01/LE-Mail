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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-[2px] p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-black/[0.08] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-black/[0.08] bg-[#f5f5f7]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#0071e3]/12 text-[#0071e3]">
              <Palette className="h-4 w-4" />
            </div>
            <h2 className="text-[14px] font-semibold text-[#1d1d1f]">
              {isEdit ? '캘린더 수정' : '새 캘린더 만들기'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#86868b] hover:bg-black/[0.06] hover:text-[#1d1d1f] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4">
            {error && (
              <div className="rounded-xl bg-[#ff3b30]/[0.06] border border-[#ff3b30]/20 px-3.5 py-2.5 text-xs font-medium text-[#d70015]">
                {error}
              </div>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-[#6e6e73] mb-1.5">
                캘린더 이름 *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 프로젝트, 개인 일정"
                autoFocus
                className="w-full rounded-xl border border-black/[0.12] bg-white px-3.5 py-2 text-[13px] text-[#1d1d1f] placeholder:text-[#86868b] focus:border-[#0071e3] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/20"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#6e6e73] mb-2">
                색상 선택
              </label>
              <div className="flex flex-wrap gap-2.5">
                {CALENDAR_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`h-7 w-7 rounded-full transition-transform ${
                      color === c ? 'ring-2 ring-offset-2 ring-[#0071e3] scale-110' : 'hover:scale-105'
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
          </div>

          <div className="flex items-center justify-between px-6 py-3.5 border-t border-black/[0.08] bg-[#f5f5f7]/70">
            <div>
              {isEdit && !initialCalendar?.isDefault && onDelete && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-[#d70015] hover:bg-[#ff3b30]/10 transition-colors"
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
                className="rounded-lg px-3.5 py-2 text-xs font-medium text-[#6e6e73] hover:bg-black/[0.05] hover:text-[#1d1d1f] transition-colors"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-[#0071e3] px-5 py-2 text-xs font-medium text-white hover:bg-[#0077ed] shadow-xs transition-colors disabled:opacity-50"
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
