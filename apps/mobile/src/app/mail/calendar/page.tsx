'use client';

import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  CalendarPlus,
  Calendar as CalendarIcon,
  MapPin,
  Settings2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import {
  CalendarDto,
  CalendarEventDto,
  CreateCalendarDto,
  UpdateCalendarDto,
  CreateCalendarEventDto,
  UpdateCalendarEventDto,
} from '@lemail/shared-types';
import { calendarApi } from '../../../lib/api';
import { EventModal } from '../../../components/calendar/EventModal';
import { CalendarManageModal } from '../../../components/calendar/CalendarManageModal';
import { addMonths, getVisibleRange } from '../../../components/calendar/dateUtils';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function CalendarPageContent() {
  const { user } = useAuth();
  const [anchorDate, setAnchorDate] = useState<Date>(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [calendars, setCalendars] = useState<CalendarDto[]>([]);
  const [events, setEvents] = useState<CalendarEventDto[]>([]);
  const [loading, setLoading] = useState(true);

  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEventDto | null>(null);

  const [calModalOpen, setCalModalOpen] = useState(false);
  const [editingCalendar, setEditingCalendar] = useState<CalendarDto | null>(null);

  const loadCalendars = useCallback(async () => {
    try {
      const data = await calendarApi.getCalendars();
      setCalendars(data || []);
      return data || [];
    } catch {
      return [];
    }
  }, []);

  const loadEvents = useCallback(
    async (currentCalendars?: CalendarDto[]) => {
      setLoading(true);
      try {
        const list = currentCalendars || calendars;
        const visibleIds = list.filter((c) => c.isVisible).map((c) => c.id);
        const { start, end } = getVisibleRange(anchorDate, 'month');

        if (list.length > 0 && visibleIds.length === 0) {
          setEvents([]);
          return;
        }

        const data = await calendarApi.getEvents({
          start: start.toISOString(),
          end: end.toISOString(),
          calendarIds: visibleIds.length > 0 ? visibleIds : undefined,
        });
        setEvents(data || []);
      } catch {
        setEvents([]);
      } finally {
        setLoading(false);
      }
    },
    [anchorDate, calendars],
  );

  useEffect(() => {
    loadCalendars().then((cals) => loadEvents(cals));
  }, [anchorDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const monthDays = useMemo(() => {
    const year = anchorDate.getFullYear();
    const month = anchorDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const startOffset = firstDay.getDay();
    const startDate = new Date(year, month, 1 - startOffset);

    const days: Date[] = [];
    for (let i = 0; i < 42; i++) {
      days.push(new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i));
    }
    return days;
  }, [anchorDate]);

  const calendarColorMap = useMemo(() => {
    const map = new Map<string, string>();
    calendars.forEach((c) => map.set(c.id, c.color || '#007AFF'));
    return map;
  }, [calendars]);

  const eventsByDayKey = useMemo(() => {
    const map = new Map<string, CalendarEventDto[]>();
    events.forEach((ev) => {
      const s = new Date(ev.startAt);
      const key = `${s.getFullYear()}-${s.getMonth()}-${s.getDate()}`;
      const arr = map.get(key) || [];
      arr.push(ev);
      map.set(key, arr);
    });
    return map;
  }, [events]);

  const selectedDayEvents = useMemo(() => {
    const key = `${selectedDate.getFullYear()}-${selectedDate.getMonth()}-${selectedDate.getDate()}`;
    return (eventsByDayKey.get(key) || []).sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
    );
  }, [eventsByDayKey, selectedDate]);

  const today = useMemo(() => new Date(), []);

  const handleSaveEvent = async (payload: CreateCalendarEventDto | UpdateCalendarEventDto) => {
    if (editingEvent) {
      await calendarApi.updateEvent(editingEvent.id, payload as UpdateCalendarEventDto);
    } else {
      await calendarApi.createEvent(payload as CreateCalendarEventDto);
    }
    await loadEvents();
  };

  const handleDeleteEvent = async (id: string) => {
    await calendarApi.deleteEvent(id);
    await loadEvents();
  };

  const handleSaveCalendar = async (payload: CreateCalendarDto | UpdateCalendarDto) => {
    if (editingCalendar) {
      await calendarApi.updateCalendar(editingCalendar.id, payload as UpdateCalendarDto);
    } else {
      await calendarApi.createCalendar(payload as CreateCalendarDto);
    }
    const cals = await loadCalendars();
    await loadEvents(cals);
  };

  const handleToggleCalendarVisibility = async (cal: CalendarDto) => {
    if (user && cal.userId !== user.id) return;
    await calendarApi.updateCalendar(cal.id, { isVisible: !cal.isVisible });
    const updated = await loadCalendars();
    await loadEvents(updated);
  };

  return (
    <div className="pb-8 space-y-3">
      {/* 상단 월 네비게이션 */}
      <div className="flex items-center justify-between px-3 pt-1">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setAnchorDate((d) => addMonths(d, -1))}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-600 shadow-xs border border-slate-200/70 active:scale-95"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="px-2 text-base font-bold text-slate-900">
            {anchorDate.getFullYear()}년 {anchorDate.getMonth() + 1}월
          </span>
          <button
            type="button"
            onClick={() => setAnchorDate((d) => addMonths(d, 1))}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-600 shadow-xs border border-slate-200/70 active:scale-95"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              const now = new Date();
              setAnchorDate(now);
              setSelectedDate(now);
            }}
            className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#007AFF] shadow-xs border border-slate-200/70 active:scale-95"
          >
            오늘
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingCalendar(null);
              setCalModalOpen(true);
            }}
            aria-label="캘린더 관리"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-600 shadow-xs border border-slate-200/70 active:scale-95"
          >
            <Settings2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 내 캘린더 가로 스크롤 칩 바 */}
      {calendars.length > 0 && (
        <div className="px-3 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {calendars.map((cal) => {
            const isOwner = !user || cal.userId === user.id;
            return (
              <div
                key={cal.id}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  cal.isVisible
                    ? 'border-slate-200/80 bg-white text-slate-800 shadow-xs'
                    : 'border-slate-200/50 bg-white/60 text-slate-400 opacity-70'
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleToggleCalendarVisibility(cal)}
                  disabled={!isOwner}
                  title={cal.isVisible ? '캘린더 숨기기' : '캘린더 표시하기'}
                  className="inline-flex items-center gap-1.5 whitespace-nowrap disabled:cursor-default"
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: cal.color || '#007AFF' }}
                  />
                  <span>{cal.name}</span>
                  {cal.type === 'SHARED' && (
                    <span className="rounded bg-indigo-50 px-1 py-0.5 text-[10px] font-semibold text-indigo-600">
                      공유
                    </span>
                  )}
                  {cal.type === 'HOLIDAY' && (
                    <span className="rounded bg-rose-50 px-1 py-0.5 text-[10px] font-semibold text-rose-600">
                      공휴일
                    </span>
                  )}
                  {isOwner &&
                    (cal.isVisible ? (
                      <Eye className="h-3 w-3 text-slate-400" />
                    ) : (
                      <EyeOff className="h-3 w-3 text-slate-300" />
                    ))}
                </button>

                {isOwner && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCalendar(cal);
                      setCalModalOpen(true);
                    }}
                    aria-label={`${cal.name} 설정`}
                    title="캘린더 설정"
                    className="ml-0.5 rounded-full p-0.5 text-slate-400 active:bg-slate-100 hover:text-slate-700"
                  >
                    <Settings2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 컴팩트 월간 그리드 카드 */}
      <div className="mx-3 rounded-2xl bg-white p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-slate-200/60">
        <div className="grid grid-cols-7 pb-2 text-center">
          {WEEKDAYS.map((w, idx) => (
            <span
              key={w}
              className={`text-[11px] font-semibold ${
                idx === 0 ? 'text-rose-500' : idx === 6 ? 'text-[#007AFF]' : 'text-slate-400'
              }`}
            >
              {w}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-y-1">
          {monthDays.map((day, idx) => {
            const inCurrentMonth = day.getMonth() === anchorDate.getMonth();
            const isToday = isSameDay(day, today);
            const isSelected = isSameDay(day, selectedDate);
            const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
            const dayEvents = eventsByDayKey.get(key) || [];

            return (
              <button
                key={idx}
                type="button"
                onClick={() => setSelectedDate(day)}
                className="flex flex-col items-center justify-center py-1"
              >
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-semibold transition ${
                    isToday
                      ? 'bg-[#007AFF] text-white shadow-sm shadow-blue-500/30'
                      : isSelected
                      ? 'bg-[#007AFF]/15 text-[#007AFF]'
                      : !inCurrentMonth
                      ? 'text-slate-300'
                      : day.getDay() === 0
                      ? 'text-rose-500'
                      : day.getDay() === 6
                      ? 'text-[#007AFF]'
                      : 'text-slate-800'
                  }`}
                >
                  {day.getDate()}
                </span>
                <div className="mt-0.5 flex h-1.5 items-center gap-0.5">
                  {dayEvents.slice(0, 3).map((ev) => (
                    <span
                      key={ev.id}
                      className="h-1 w-1 rounded-full"
                      style={{ backgroundColor: calendarColorMap.get(ev.calendarId) || '#007AFF' }}
                    />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 선택된 날짜 아젠다 */}
      <div className="px-3 pt-1">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-sm font-bold text-slate-900">
            {selectedDate.getMonth() + 1}월 {selectedDate.getDate()}일 ({WEEKDAYS[selectedDate.getDay()]}) 일정
          </h2>
          <span className="text-xs font-medium text-slate-400">{selectedDayEvents.length}건</span>
        </div>

        {loading ? (
          <div className="rounded-2xl bg-white p-6 text-center text-xs text-slate-400">
            일정을 불러오는 중...
          </div>
        ) : selectedDayEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl bg-white py-10 px-4 text-center border border-slate-200/60">
            <CalendarIcon className="mb-2 h-7 w-7 text-slate-300" />
            <p className="text-xs font-semibold text-slate-600">등록된 일정이 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {selectedDayEvents.map((ev) => {
              const color = calendarColorMap.get(ev.calendarId) || '#007AFF';
              const start = new Date(ev.startAt);
              const end = new Date(ev.endAt);
              const timeStr = ev.isAllDay
                ? '종일'
                : `${start.toLocaleTimeString('ko-KR', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                  })} - ${end.toLocaleTimeString('ko-KR', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                  })}`;

              return (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => {
                    setEditingEvent(ev);
                    setEventModalOpen(true);
                  }}
                  className="flex w-full items-stretch gap-3 rounded-2xl bg-white p-3.5 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] border border-slate-200/60 active:bg-slate-50"
                >
                  <div
                    className="w-1 rounded-full flex-shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-400">{timeStr}</p>
                    <p className="mt-0.5 truncate text-sm font-bold text-slate-900">{ev.title}</p>
                    {ev.location && (
                      <p className="mt-1 flex items-center gap-1 truncate text-xs text-slate-500">
                        <MapPin className="h-3 w-3 flex-shrink-0 text-slate-400" />
                        <span>{ev.location}</span>
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 플로팅 일정 추가 버튼 */}
      <button
        type="button"
        onClick={() => {
          setEditingEvent(null);
          setEventModalOpen(true);
        }}
        aria-label="새 일정"
        className="fixed bottom-20 right-4 z-20 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#007AFF] text-white shadow-lg shadow-blue-500/35 active:scale-95 transition-transform"
      >
        <CalendarPlus className="h-6 w-6" />
      </button>

      <EventModal
        isOpen={eventModalOpen}
        onClose={() => {
          setEventModalOpen(false);
          setEditingEvent(null);
        }}
        initialEvent={editingEvent}
        calendars={calendars}
        defaultDate={selectedDate}
        onSave={handleSaveEvent}
        onDelete={handleDeleteEvent}
      />

      <CalendarManageModal
        isOpen={calModalOpen}
        onClose={() => {
          setCalModalOpen(false);
          setEditingCalendar(null);
        }}
        initialCalendar={editingCalendar}
        onSave={handleSaveCalendar}
      />
    </div>
  );
}

export default function CalendarPage() {
  return (
    <Suspense fallback={null}>
      <CalendarPageContent />
    </Suspense>
  );
}
