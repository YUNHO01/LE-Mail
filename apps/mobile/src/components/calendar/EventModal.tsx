'use client';

import React, { useState, useEffect } from 'react';
import {
    X,
    Trash2,
    MapPin,
    AlignLeft,
    Calendar as CalendarIcon,
    Clock,
    Repeat,
    Bell,
    Users,
    Plus,
} from 'lucide-react';
import {
    CalendarDto,
    CalendarEventDto,
    CreateCalendarEventDto,
    UpdateCalendarEventDto,
    CreateCalendarAttendeeDto,
    ContactSearchResultDto,
} from '@lemail/shared-types';
import { contactsApi } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { SelectDropdown, ToggleSwitch } from '../common';
import { formatDateInputValue, formatTimeInputValue } from './dateUtils';

export interface EventDraftInitial {
    title?: string;
    description?: string;
    location?: string;
    sourceMailId?: string;
    attendees?: CreateCalendarAttendeeDto[];
}

interface EventModalProps {
    isOpen: boolean;
    onClose: () => void;
    calendars: CalendarDto[];
    initialEvent?: CalendarEventDto | null;
    initialDraft?: EventDraftInitial | null;
    defaultDate?: Date | null;
    defaultIsAllDay?: boolean;
    onSave: (
        payload: CreateCalendarEventDto | UpdateCalendarEventDto,
        eventId?: string,
    ) => Promise<void>;
    onDelete?: (eventId: string) => Promise<void>;
}

const RECURRENCE_OPTIONS = [
    { value: '', label: '반복 안 함' },
    { value: 'FREQ=DAILY;INTERVAL=1', label: '매일' },
    { value: 'FREQ=WEEKLY;INTERVAL=1', label: '매주' },
    { value: 'FREQ=MONTHLY;INTERVAL=1', label: '매월' },
    { value: 'FREQ=YEARLY;INTERVAL=1', label: '매년' },
];

const REMINDER_OPTIONS = [
    { value: '', label: '알림 없음' },
    { value: '0', label: '일정 시작 시간' },
    { value: '10', label: '10분 전' },
    { value: '30', label: '30분 전' },
    { value: '60', label: '1시간 전' },
    { value: '1440', label: '1일 전' },
];

export const EventModal: React.FC<EventModalProps> = ({
    isOpen,
    onClose,
    calendars,
    initialEvent,
    initialDraft,
    defaultDate,
    defaultIsAllDay = false,
    onSave,
    onDelete,
}) => {
    const { user } = useAuth();
    const isEdit = Boolean(initialEvent);
    const isReadOnly = Boolean(initialEvent?.isReadOnly);
    const writableCalendars = calendars.filter(
        (c) => c.type !== 'HOLIDAY' && (!user?.id || c.userId === user.id),
    );

    const [title, setTitle] = useState('');
    const [calendarId, setCalendarId] = useState('');
    const [isAllDay, setIsAllDay] = useState(false);
    const [startDate, setStartDate] = useState('');
    const [startTime, setStartTime] = useState('09:00');
    const [endDate, setEndDate] = useState('');
    const [endTime, setEndTime] = useState('10:00');
    const [rrule, setRrule] = useState('');
    const [recurrenceEndDate, setRecurrenceEndDate] = useState('');
    const [reminderMinutes, setReminderMinutes] = useState('');
    const [location, setLocation] = useState('');
    const [description, setDescription] = useState('');
    const [attendees, setAttendees] = useState<CreateCalendarAttendeeDto[]>([]);
    const [attendeeQuery, setAttendeeQuery] = useState('');
    const [searchResults, setSearchResults] = useState<ContactSearchResultDto[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        setError('');
        setAttendeeQuery('');
        setSearchResults([]);

        const defaultCal =
            writableCalendars.find((c) => c.isDefault)?.id ||
            writableCalendars[0]?.id ||
            '';

        if (initialEvent) {
            const s = new Date(initialEvent.startAt);
            const e = new Date(initialEvent.endAt);
            setTitle(initialEvent.title);
            setCalendarId(initialEvent.calendarId || defaultCal);
            setIsAllDay(Boolean(initialEvent.isAllDay));
            setStartDate(formatDateInputValue(s));
            setStartTime(formatTimeInputValue(s));
            setEndDate(formatDateInputValue(e));
            setEndTime(formatTimeInputValue(e));
            setRrule(initialEvent.rrule || '');
            setRecurrenceEndDate(
                initialEvent.recurrenceEndAt
                    ? formatDateInputValue(new Date(initialEvent.recurrenceEndAt))
                    : '',
            );
            setReminderMinutes(
                initialEvent.reminderMinutesBefore !== null &&
                    initialEvent.reminderMinutesBefore !== undefined
                    ? String(initialEvent.reminderMinutesBefore)
                    : '',
            );
            setLocation(initialEvent.location || '');
            setDescription(initialEvent.description || '');
            setAttendees(
                (initialEvent.attendees || []).map((a) => ({
                    email: a.email,
                    name: a.name ?? null,
                })),
            );
        } else {
            const base = defaultDate ? new Date(defaultDate) : new Date();
            const endBase = new Date(base);
            if (
                !defaultDate ||
                (base.getHours() === 0 && base.getMinutes() === 0 && !defaultIsAllDay)
            ) {
                base.setHours(9, 0, 0, 0);
                endBase.setHours(10, 0, 0, 0);
            } else {
                endBase.setHours(base.getHours() + 1);
            }
            setTitle(initialDraft?.title || '');
            setCalendarId(defaultCal);
            setIsAllDay(defaultIsAllDay);
            setStartDate(formatDateInputValue(base));
            setStartTime(formatTimeInputValue(base));
            setEndDate(formatDateInputValue(endBase));
            setEndTime(formatTimeInputValue(endBase));
            setRrule('');
            setRecurrenceEndDate('');
            setReminderMinutes('10');
            setLocation(initialDraft?.location || '');
            setDescription(initialDraft?.description || '');
            setAttendees(initialDraft?.attendees || []);
        }
    }, [isOpen, initialEvent, initialDraft, defaultDate, defaultIsAllDay, calendars]);

    // 참석자 주소록 자동완성 검색
    useEffect(() => {
        const q = attendeeQuery.trim();
        if (!q || q.length < 1) {
            setSearchResults([]);
            return;
        }
        const timer = setTimeout(async () => {
            try {
                const res = await contactsApi.search(q);
                setSearchResults(res || []);
            } catch {
                setSearchResults([]);
            }
        }, 200);
        return () => clearTimeout(timer);
    }, [attendeeQuery]);

    if (!isOpen) return null;

    const addAttendee = (email: string, name?: string | null) => {
        const normalized = email.trim().toLowerCase();
        if (!normalized || !normalized.includes('@')) return;
        if (attendees.some((a) => a.email.toLowerCase() === normalized)) return;
        setAttendees((prev) => [...prev, { email: normalized, name: name || null }]);
        setAttendeeQuery('');
        setSearchResults([]);
    };

    const removeAttendee = (email: string) => {
        setAttendees((prev) => prev.filter((a) => a.email !== email));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) {
            setError('일정 제목을 입력해 주세요.');
            return;
        }
        if (!startDate || !endDate || (!isAllDay && (!startTime || !endTime))) {
            setError('시작 및 종료 일시를 입력해 주세요.');
            return;
        }

        const startIso = isAllDay
            ? new Date(`${startDate}T00:00:00`).toISOString()
            : new Date(`${startDate}T${startTime}:00`).toISOString();
        const endIso = isAllDay
            ? new Date(`${endDate}T23:59:59`).toISOString()
            : new Date(`${endDate}T${endTime}:00`).toISOString();

        if (new Date(endIso) < new Date(startIso)) {
            setError('종료 일시는 시작 일시보다 빠를 수 없습니다.');
            return;
        }

        setSubmitting(true);
        setError('');
        try {
            await onSave(
                {
                    calendarId: calendarId || undefined,
                    title: title.trim(),
                    location: location.trim() || null,
                    description: description.trim() || null,
                    startAt: startIso,
                    endAt: endIso,
                    isAllDay,
                    rrule: rrule || null,
                    recurrenceEndAt:
                        rrule && recurrenceEndDate
                            ? new Date(`${recurrenceEndDate}T23:59:59`).toISOString()
                            : null,
                    reminderMinutesBefore:
                        reminderMinutes !== '' ? Number(reminderMinutes) : null,
                    sourceMailId: initialDraft?.sourceMailId || undefined,
                    attendees,
                },
                initialEvent?.id,
            );
            onClose();
        } catch (err: any) {
            setError(err?.message || '일정 저장 중 오류가 발생했습니다.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!initialEvent || !onDelete) return;
        if (!confirm('이 일정을 삭제하시겠습니까?')) return;
        setSubmitting(true);
        try {
            await onDelete(initialEvent.id);
            onClose();
        } catch (err: any) {
            setError(err?.message || '일정 삭제 중 오류가 발생했습니다.');
        } finally {
            setSubmitting(false);
        }
    };

    const inputClass = `w-full min-w-0 rounded-xl border border-slate-200 px-3.5 py-2.5 text-base sm:text-sm focus:border-[#007AFF] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/15 transition ${
        isReadOnly
            ? 'bg-slate-50 text-slate-600 cursor-default'
            : 'bg-white text-slate-900 placeholder:text-slate-400'
    }`;

    const dateTimeInputClass = `min-w-0 min-h-[42px] sm:min-h-[38px] rounded-xl border border-slate-200 px-2.5 py-1.5 text-base sm:text-sm focus:border-[#007AFF] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/15 transition ${
        isReadOnly
            ? 'bg-slate-50 text-slate-600 cursor-default'
            : 'bg-white text-slate-900'
    }`;

    return (
        <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-[1px] sm:p-4"
            onClick={onClose}
        >
            <div
                className="relative flex w-full max-w-xl h-[100dvh] max-h-[100dvh] sm:h-auto sm:max-h-[88dvh] flex-col rounded-none sm:rounded-2xl bg-white shadow-2xl border-0 sm:border sm:border-slate-200/80 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header (Fixed) */}
                <div className="flex h-14 items-center justify-between px-4 sm:px-6 border-b border-slate-100 bg-white shrink-0">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#007AFF]/10 text-[#007AFF]">
                            <CalendarIcon className="h-4 w-4" />
                        </div>
                        <h2 className="text-base font-bold text-slate-900 truncate">
                            {isReadOnly ? '일정 상세 (읽기 전용)' : isEdit ? '일정 수정' : '새 일정 등록'}
                        </h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="닫기"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 active:bg-slate-100 hover:bg-slate-100 hover:text-slate-600 transition"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Form Body + Fixed Footer */}
                <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
                    <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 space-y-4">
                        {error && (
                            <div className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs font-medium text-rose-700">
                                {error}
                            </div>
                        )}

                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                제목 {!isReadOnly && <span className="text-rose-500">*</span>}
                            </label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="일정 제목을 입력하세요"
                                disabled={isReadOnly}
                                className={inputClass}
                            />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                    캘린더
                                </label>
                                <SelectDropdown
                                    options={(isReadOnly ? calendars : writableCalendars).map((c) => ({
                                        value: c.id,
                                        label: c.name,
                                        icon: (
                                            <span
                                                className="h-2.5 w-2.5 rounded-full shrink-0"
                                                style={{ backgroundColor: c.color }}
                                            />
                                        ),
                                    }))}
                                    value={calendarId}
                                    onChange={setCalendarId}
                                    disabled={isReadOnly}
                                    size="md"
                                    fullWidth
                                />
                            </div>

                            <div className="flex items-center sm:items-end sm:pb-2 pt-1 sm:pt-0">
                                <ToggleSwitch
                                    checked={isAllDay}
                                    onChange={setIsAllDay}
                                    disabled={isReadOnly}
                                    label="종일 일정"
                                    color="sky"
                                />
                            </div>
                        </div>

                        <div className="space-y-3 rounded-2xl bg-slate-50/80 p-3.5 border border-slate-200/70">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                                <Clock className="h-3.5 w-3.5 text-[#007AFF]" />
                                <span>일시</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="min-w-0">
                                    <span className="block text-[11px] font-medium text-slate-500 mb-1">시작</span>
                                    <div className="flex gap-1.5 min-w-0">
                                        <input
                                            type="date"
                                            value={startDate}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setStartDate(val);
                                                if (val && endDate && val > endDate) setEndDate(val);
                                            }}
                                            disabled={isReadOnly}
                                            required
                                            aria-label="시작 날짜"
                                            className={`${dateTimeInputClass} flex-1`}
                                        />
                                        {!isAllDay && (
                                            <input
                                                type="time"
                                                value={startTime}
                                                onChange={(e) => setStartTime(e.target.value)}
                                                disabled={isReadOnly}
                                                required
                                                aria-label="시작 시간"
                                                className={`${dateTimeInputClass} w-32 sm:w-28 shrink-0`}
                                            />
                                        )}
                                    </div>
                                </div>
                                <div className="min-w-0">
                                    <span className="block text-[11px] font-medium text-slate-500 mb-1">종료</span>
                                    <div className="flex gap-1.5 min-w-0">
                                        <input
                                            type="date"
                                            value={endDate}
                                            min={startDate || undefined}
                                            onChange={(e) => setEndDate(e.target.value)}
                                            disabled={isReadOnly}
                                            required
                                            aria-label="종료 날짜"
                                            className={`${dateTimeInputClass} flex-1`}
                                        />
                                        {!isAllDay && (
                                            <input
                                                type="time"
                                                value={endTime}
                                                onChange={(e) => setEndTime(e.target.value)}
                                                disabled={isReadOnly}
                                                required
                                                aria-label="종료 시간"
                                                className={`${dateTimeInputClass} w-32 sm:w-28 shrink-0`}
                                            />
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 반복 및 이메일 알림 */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5">
                                    <Repeat className="h-3.5 w-3.5 text-slate-400" />
                                    <span>반복</span>
                                </label>
                                <SelectDropdown
                                    options={RECURRENCE_OPTIONS}
                                    value={rrule}
                                    onChange={setRrule}
                                    disabled={isReadOnly}
                                    size="md"
                                    fullWidth
                                />
                                {rrule && (
                                    <div className="mt-2 flex items-center gap-2">
                                        <span className="text-[11px] text-slate-500 shrink-0">종료일:</span>
                                        <input
                                            type="date"
                                            value={recurrenceEndDate}
                                            min={startDate || undefined}
                                            onChange={(e) => setRecurrenceEndDate(e.target.value)}
                                            disabled={isReadOnly}
                                            aria-label="반복 종료일"
                                            className={`${dateTimeInputClass} flex-1`}
                                        />
                                        {recurrenceEndDate && !isReadOnly && (
                                            <button
                                                type="button"
                                                onClick={() => setRecurrenceEndDate('')}
                                                aria-label="반복 종료일 지우기"
                                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5">
                                    <Bell className="h-3.5 w-3.5 text-slate-400" />
                                    <span>이메일 알림</span>
                                </label>
                                <SelectDropdown
                                    options={REMINDER_OPTIONS}
                                    value={reminderMinutes}
                                    onChange={setReminderMinutes}
                                    disabled={isReadOnly}
                                    size="md"
                                    fullWidth
                                />
                            </div>
                        </div>

                        {/* 참석자 (주소록 자동완성 연동) */}
                        {(!isReadOnly || attendees.length > 0) && (
                            <div>
                                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5">
                                    <Users className="h-3.5 w-3.5 text-slate-400" />
                                    <span>참석자</span>
                                </label>
                                {!isReadOnly && (
                                    <div className="relative">
                                        <div className="flex gap-1.5">
                                            <input
                                                type="text"
                                                value={attendeeQuery}
                                                onChange={(e) => setAttendeeQuery(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        if (attendeeQuery.includes('@')) {
                                                            addAttendee(attendeeQuery);
                                                        }
                                                    }
                                                }}
                                                placeholder="이름 또는 이메일 검색 후 선택"
                                                className={`flex-1 ${inputClass}`}
                                            />
                                            {attendeeQuery.includes('@') && (
                                                <button
                                                    type="button"
                                                    onClick={() => addAttendee(attendeeQuery)}
                                                    className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 active:bg-slate-200 whitespace-nowrap"
                                                >
                                                    <Plus className="h-3.5 w-3.5" />
                                                    추가
                                                </button>
                                            )}
                                        </div>

                                        {searchResults.length > 0 && (
                                            <div className="absolute left-0 right-0 mt-1 max-h-40 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg z-20 divide-y divide-slate-100">
                                                {searchResults.map((c) => (
                                                    <button
                                                        key={`${c.source}-${c.id}`}
                                                        type="button"
                                                        onClick={() => addAttendee(c.email, c.name)}
                                                        className="w-full text-left px-3.5 py-2.5 text-xs active:bg-sky-50 hover:bg-sky-50 flex items-center justify-between gap-2"
                                                    >
                                                        <div className="min-w-0 flex-1 truncate">
                                                            <span className="font-semibold text-slate-800">{c.name}</span>
                                                            <span className="ml-2 text-slate-500">{c.email}</span>
                                                        </div>
                                                        <span className="shrink-0 text-[10px] rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">
                                                            {c.source === 'SYSTEM_USER' ? '사내' : '주소록'}
                                                        </span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {attendees.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                        {attendees.map((a) => (
                                            <span
                                                key={a.email}
                                                className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-sky-50 border border-sky-200 px-2.5 py-1 text-xs font-medium text-sky-800"
                                            >
                                                <span className="truncate">
                                                    {a.name ? `${a.name} (${a.email})` : a.email}
                                                </span>
                                                {!isReadOnly && (
                                                    <button
                                                        type="button"
                                                        onClick={() => removeAttendee(a.email)}
                                                        aria-label={`${a.email} 제거`}
                                                        className="shrink-0 text-sky-500 active:text-sky-800"
                                                    >
                                                        <X className="h-3.5 w-3.5" />
                                                    </button>
                                                )}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {(!isReadOnly || location) && (
                            <div>
                                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5">
                                    <MapPin className="h-3.5 w-3.5 text-slate-400" />
                                    <span>장소</span>
                                </label>
                                <input
                                    type="text"
                                    value={location}
                                    onChange={(e) => setLocation(e.target.value)}
                                    placeholder={isReadOnly ? '' : '회의실 또는 화상회의 링크'}
                                    disabled={isReadOnly}
                                    className={inputClass}
                                />
                            </div>
                        )}

                        {(!isReadOnly || description) && (
                            <div>
                                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5">
                                    <AlignLeft className="h-3.5 w-3.5 text-slate-400" />
                                    <span>메모</span>
                                </label>
                                <textarea
                                    rows={3}
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder={isReadOnly ? '' : '일정에 대한 상세 내용을 입력하세요'}
                                    disabled={isReadOnly}
                                    className={`${inputClass} resize-none`}
                                />
                            </div>
                        )}
                    </div>

                    {/* Footer Actions (Fixed) */}
                    <div className="flex items-center gap-2.5 border-t border-slate-100 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 shrink-0">
                        {!isReadOnly && isEdit && onDelete && (
                            <button
                                type="button"
                                onClick={handleDelete}
                                disabled={submitting}
                                aria-label="일정 삭제"
                                className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm font-semibold text-rose-600 active:bg-rose-100 transition disabled:opacity-50"
                            >
                                <Trash2 className="h-4 w-4" />
                                <span>삭제</span>
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={submitting}
                            className="flex-1 rounded-xl border border-slate-200 bg-slate-50 py-3 text-sm font-semibold text-slate-700 active:bg-slate-100 transition disabled:opacity-50"
                        >
                            {isReadOnly ? '닫기' : '취소'}
                        </button>
                        {!isReadOnly && (
                            <button
                                type="submit"
                                disabled={submitting}
                                className="flex-1 rounded-xl bg-[#007AFF] py-3 text-sm font-semibold text-white shadow-sm shadow-blue-500/20 active:scale-[0.98] transition disabled:opacity-50"
                            >
                                {submitting ? '저장 중...' : isEdit ? '수정 저장' : '일정 등록'}
                            </button>
                        )}
                    </div>
                </form>
            </div>
        </div>
    );
};
