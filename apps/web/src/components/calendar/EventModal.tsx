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
import { DatePicker, TimePicker, SelectDropdown, ToggleSwitch } from '../common';
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

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-[2px] p-4">
            <div className="w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl border border-black/[0.08] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-black/[0.08] bg-[#f5f5f7] shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#0071e3]/12 text-[#0071e3]">
                            <CalendarIcon className="h-4 w-4" />
                        </div>
                        <h2 className="text-[14px] font-semibold text-[#1d1d1f]">
                            {isReadOnly ? '일정 상세 (읽기 전용)' : isEdit ? '일정 수정' : '새 일정 등록'}
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

                <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
                    <div className="flex-1 overflow-y-auto p-6 space-y-4">
                        {error && (
                            <div className="rounded-xl bg-[#ff3b30]/[0.06] border border-[#ff3b30]/20 px-3.5 py-2.5 text-xs font-medium text-[#d70015]">
                                {error}
                            </div>
                        )}

                        <div>
                            <label className="block text-[11px] font-semibold text-[#6e6e73] mb-1.5">
                                제목 *
                            </label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="일정 제목을 입력하세요"
                                autoFocus
                                className="w-full rounded-xl border border-black/[0.12] bg-white px-3.5 py-2 text-[13px] text-[#1d1d1f] placeholder:text-[#86868b] focus:border-[#0071e3] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/20"
                            />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[11px] font-semibold text-[#6e6e73] mb-1.5">
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

                            <div className="flex items-end pb-2">
                                <ToggleSwitch
                                    checked={isAllDay}
                                    onChange={setIsAllDay}
                                    disabled={isReadOnly}
                                    label="종일 일정"
                                    color="sky"
                                />
                            </div>
                        </div>

                        <div className="rounded-2xl bg-white border border-black/[0.08] overflow-hidden">
                            <div className="flex items-center gap-1.5 px-4 py-2.5 bg-black/[0.02] border-b border-black/[0.06] text-[11px] font-semibold text-[#6e6e73]">
                                <Clock className="h-3.5 w-3.5 text-[#0071e3]" />
                                <span>일시</span>
                            </div>
                            <div className="p-3.5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <span className="block text-[11px] font-medium text-[#6e6e73] mb-1">시작</span>
                                    <div className="flex gap-1.5">
                                        <DatePicker
                                            value={startDate}
                                            onChange={(val) => {
                                                setStartDate(val);
                                                if (val && val > endDate) setEndDate(val);
                                            }}
                                            disabled={isReadOnly}
                                            size="sm"
                                            className="flex-1"
                                        />
                                        {!isAllDay && (
                                            <TimePicker
                                                value={startTime}
                                                onChange={setStartTime}
                                                minuteIncrement={10}
                                                disabled={isReadOnly}
                                                size="sm"
                                                className="w-28 shrink-0"
                                            />
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <span className="block text-[11px] font-medium text-[#6e6e73] mb-1">종료</span>
                                    <div className="flex gap-1.5">
                                        <DatePicker
                                            value={endDate}
                                            onChange={setEndDate}
                                            minDate={startDate}
                                            disabled={isReadOnly}
                                            size="sm"
                                            className="flex-1"
                                        />
                                        {!isAllDay && (
                                            <TimePicker
                                                value={endTime}
                                                onChange={setEndTime}
                                                minuteIncrement={10}
                                                disabled={isReadOnly}
                                                size="sm"
                                                className="w-28 shrink-0"
                                            />
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 반복 및 이메일 알림 */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[#6e6e73] mb-1.5">
                                    <Repeat className="h-3.5 w-3.5 text-[#86868b]" />
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
                                    <div className="mt-1.5 flex items-center gap-2">
                                        <span className="text-[11px] text-[#6e6e73] shrink-0">종료일:</span>
                                        <DatePicker
                                            value={recurrenceEndDate}
                                            onChange={setRecurrenceEndDate}
                                            minDate={startDate}
                                            allowClear
                                            disabled={isReadOnly}
                                            size="xs"
                                            className="flex-1"
                                        />
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[#6e6e73] mb-1.5">
                                    <Bell className="h-3.5 w-3.5 text-[#86868b]" />
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
                        <div>
                            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[#6e6e73] mb-1.5">
                                <Users className="h-3.5 w-3.5 text-[#86868b]" />
                                <span>참석자</span>
                            </label>
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
                                        placeholder="이름 또는 이메일 검색 후 선택 (직접 입력 시 Enter)"
                                        className="flex-1 rounded-xl border border-black/[0.12] bg-white px-3.5 py-2 text-xs text-[#1d1d1f] placeholder:text-[#86868b] focus:border-[#0071e3] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/20"
                                    />
                                    {attendeeQuery.includes('@') && (
                                        <button
                                            type="button"
                                            onClick={() => addAttendee(attendeeQuery)}
                                            className="inline-flex items-center gap-1 rounded-xl bg-black/[0.05] px-3 py-2 text-xs font-medium text-[#1d1d1f] hover:bg-black/[0.09] transition-colors"
                                        >
                                            <Plus className="h-3.5 w-3.5" />
                                            추가
                                        </button>
                                    )}
                                </div>

                                {searchResults.length > 0 && (
                                    <div className="absolute left-0 right-0 mt-1 max-h-40 overflow-y-auto rounded-xl border border-black/[0.08] bg-white shadow-lg z-20 divide-y divide-black/[0.06]">
                                        {searchResults.map((c) => (
                                            <button
                                                key={`${c.source}-${c.id}`}
                                                type="button"
                                                onClick={() => addAttendee(c.email, c.name)}
                                                className="w-full text-left px-3.5 py-2 text-xs hover:bg-[#0071e3]/[0.05] flex items-center justify-between transition-colors"
                                            >
                                                <div>
                                                    <span className="font-semibold text-[#1d1d1f]">{c.name}</span>
                                                    <span className="ml-2 text-[#6e6e73]">{c.email}</span>
                                                </div>
                                                <span className="text-[10px] rounded bg-black/[0.05] px-1.5 py-0.5 text-[#6e6e73]">
                                                    {c.source === 'SYSTEM_USER' ? '사내' : '주소록'}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {attendees.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                    {attendees.map((a) => (
                                        <span
                                            key={a.email}
                                            className="inline-flex items-center gap-1.5 rounded-full bg-[#0071e3]/10 border border-[#0071e3]/20 px-2.5 py-1 text-[11px] font-medium text-[#0071e3]"
                                        >
                                            <span>{a.name ? `${a.name} (${a.email})` : a.email}</span>
                                            <button
                                                type="button"
                                                onClick={() => removeAttendee(a.email)}
                                                className="text-[#0071e3]/70 hover:text-[#0071e3]"
                                            >
                                                <X className="h-3 w-3" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[#6e6e73] mb-1.5">
                                <MapPin className="h-3.5 w-3.5 text-[#86868b]" />
                                <span>장소</span>
                            </label>
                            <input
                                type="text"
                                value={location}
                                onChange={(e) => setLocation(e.target.value)}
                                placeholder="회의실 또는 화상회의 링크"
                                className="w-full rounded-xl border border-black/[0.12] bg-white px-3.5 py-2 text-[13px] text-[#1d1d1f] placeholder:text-[#86868b] focus:border-[#0071e3] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/20"
                            />
                        </div>

                        <div>
                            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[#6e6e73] mb-1.5">
                                <AlignLeft className="h-3.5 w-3.5 text-[#86868b]" />
                                <span>메모</span>
                            </label>
                            <textarea
                                rows={3}
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="일정에 대한 상세 내용을 입력하세요"
                                className="w-full rounded-xl border border-black/[0.12] bg-white px-3.5 py-2 text-[13px] text-[#1d1d1f] placeholder:text-[#86868b] focus:border-[#0071e3] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/20 resize-none"
                            />
                        </div>
                    </div>

                    <div className="flex items-center justify-between px-6 py-3.5 border-t border-black/[0.08] bg-[#f5f5f7]/70 shrink-0">
                        <div>
                            {!isReadOnly && isEdit && onDelete && (
                                <button
                                    type="button"
                                    onClick={handleDelete}
                                    disabled={submitting}
                                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-[#d70015] hover:bg-[#ff3b30]/10 transition-colors disabled:opacity-50"
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
                                disabled={submitting}
                                className="rounded-lg px-3.5 py-2 text-xs font-medium text-[#6e6e73] hover:bg-black/[0.05] hover:text-[#1d1d1f] transition-colors"
                            >
                                {isReadOnly ? '닫기' : '취소'}
                            </button>
                            {!isReadOnly && (
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="rounded-lg bg-[#0071e3] px-5 py-2 text-xs font-medium text-white hover:bg-[#0077ed] shadow-xs transition-colors disabled:opacity-50"
                                >
                                    {submitting ? '저장 중...' : isEdit ? '수정 저장' : '일정 등록'}
                                </button>
                            )}
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
};
