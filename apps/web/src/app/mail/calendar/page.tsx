'use client';

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Search,
  Settings2,
  Eye,
  EyeOff,
  Download,
  Upload,
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
import { MonthView } from '../../../components/calendar/MonthView';
import { WeekDayView } from '../../../components/calendar/WeekDayView';
import { AgendaView } from '../../../components/calendar/AgendaView';
import { EventModal } from '../../../components/calendar/EventModal';
import { CalendarManageModal } from '../../../components/calendar/CalendarManageModal';
import {
  CalendarViewType,
  addDays,
  addMonths,
  formatPeriodTitle,
  getVisibleRange,
} from '../../../components/calendar/dateUtils';

const VIEW_TABS: { key: CalendarViewType; label: string }[] = [
  { key: 'month', label: '월' },
  { key: 'week', label: '주' },
  { key: 'day', label: '일' },
  { key: 'agenda', label: '목록' },
];

function CalendarPageContent() {
  const { user } = useAuth();
  const icsInputRef = useRef<HTMLInputElement>(null);
  const searchParams = useSearchParams();
  const initialViewParam = searchParams.get('view') as CalendarViewType | null;
  const filterCalendarId = searchParams.get('calendarId');

  const [view, setView] = useState<CalendarViewType>(
    initialViewParam && ['month', 'week', 'day', 'agenda'].includes(initialViewParam)
      ? initialViewParam
      : 'month',
  );
  const [anchorDate, setAnchorDate] = useState<Date>(() => new Date());
  const [calendars, setCalendars] = useState<CalendarDto[]>([]);
  const [events, setEvents] = useState<CalendarEventDto[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  // 일정 모달 상태
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEventDto | null>(null);
  const [defaultModalDate, setDefaultModalDate] = useState<Date | null>(null);
  const [defaultModalAllDay, setDefaultModalAllDay] = useState(false);

  // 캘린더 관리 모달 상태
  const [calModalOpen, setCalModalOpen] = useState(false);
  const [editingCalendar, setEditingCalendar] = useState<CalendarDto | null>(null);

  useEffect(() => {
    if (
      initialViewParam &&
      ['month', 'week', 'day', 'agenda'].includes(initialViewParam)
    ) {
      setView(initialViewParam);
      if (initialViewParam === 'day') {
        setAnchorDate(new Date());
      }
    }
  }, [initialViewParam]);

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
        const { start, end } = getVisibleRange(anchorDate, view);
        const targetCals = currentCalendars ?? calendars;
        let calendarIds: string[] | undefined;

        if (filterCalendarId) {
          calendarIds = [filterCalendarId];
        } else if (targetCals.length > 0) {
          calendarIds = targetCals.filter((c) => c.isVisible).map((c) => c.id);
        }

        if (calendarIds && calendarIds.length === 0) {
          setEvents([]);
          return;
        }

        const data = await calendarApi.getEvents({
          start: start.toISOString(),
          end: end.toISOString(),
          calendarIds,
          search: searchQuery.trim() || undefined,
        });
        setEvents(data || []);
      } catch {
        setEvents([]);
      } finally {
        setLoading(false);
      }
    },
    [anchorDate, view, filterCalendarId, calendars, searchQuery],
  );

  useEffect(() => {
    loadCalendars().then((cals) => {
      loadEvents(cals);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (calendars.length > 0) {
      loadEvents();
    }
  }, [anchorDate, view, filterCalendarId, searchQuery, calendars, loadEvents]);

  const handleNavigate = (dir: -1 | 0 | 1) => {
    if (dir === 0) {
      setAnchorDate(new Date());
      return;
    }
    if (view === 'month' || view === 'agenda') {
      setAnchorDate((prev) => addMonths(prev, dir));
    } else if (view === 'week') {
      setAnchorDate((prev) => addDays(prev, dir * 7));
    } else {
      setAnchorDate((prev) => addDays(prev, dir));
    }
  };

  const selectedCalendar = filterCalendarId
    ? calendars.find((c) => c.id === filterCalendarId)
    : undefined;
  const isSharedByOther = Boolean(
    selectedCalendar &&
      selectedCalendar.type === 'SHARED' &&
      user?.id &&
      selectedCalendar.userId !== user.id,
  );
  const isReadOnlyCalendar =
    isSharedByOther || selectedCalendar?.type === 'HOLIDAY';

  const handleOpenCreateEvent = (date?: Date, isAllDay = false) => {
    if (isReadOnlyCalendar) return;
    setEditingEvent(null);
    setDefaultModalDate(date || new Date());
    setDefaultModalAllDay(isAllDay);
    setEventModalOpen(true);
  };

  const handleOpenEditEvent = (ev: CalendarEventDto) => {
    setEditingEvent(ev);
    setDefaultModalDate(null);
    setEventModalOpen(true);
  };

  const handleSaveEvent = async (
    payload: CreateCalendarEventDto | UpdateCalendarEventDto,
    eventId?: string,
  ) => {
    if (eventId) {
      await calendarApi.updateEvent(eventId, payload as UpdateCalendarEventDto);
    } else {
      await calendarApi.createEvent(payload as CreateCalendarEventDto);
    }
    await loadEvents();
  };

  const handleDeleteEvent = async (eventId: string) => {
    await calendarApi.deleteEvent(eventId);
    await loadEvents();
  };

  const handleSaveCalendar = async (
    payload: CreateCalendarDto | UpdateCalendarDto,
    calendarId?: string,
  ) => {
    if (calendarId) {
      await calendarApi.updateCalendar(calendarId, payload as UpdateCalendarDto);
    } else {
      await calendarApi.createCalendar(payload as CreateCalendarDto);
    }
    const updated = await loadCalendars();
    window.dispatchEvent(new Event('calendar:refresh'));
    await loadEvents(updated);
  };

  const handleDeleteCalendar = async (calendarId: string) => {
    await calendarApi.deleteCalendar(calendarId);
    const updated = await loadCalendars();
    window.dispatchEvent(new Event('calendar:refresh'));
    await loadEvents(updated);
  };

  const handleToggleCalendarVisibility = async (cal: CalendarDto) => {
    if (user && cal.userId !== user.id) return;
    await calendarApi.updateCalendar(cal.id, { isVisible: !cal.isVisible });
    const updated = await loadCalendars();
    window.dispatchEvent(new Event('calendar:refresh'));
    await loadEvents(updated);
  };

  const handleExportIcs = async () => {
    try {
      const { start, end } = getVisibleRange(anchorDate, view);
      const blob = await calendarApi.exportIcs({
        start: start.toISOString(),
        end: end.toISOString(),
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lemail-calendar-${anchorDate.getFullYear()}-${String(anchorDate.getMonth() + 1).padStart(2, '0')}.ics`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err?.message || 'ICS 내보내기에 실패했습니다.');
    }
  };

  const handleImportIcsFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const filteredCal = calendars.find((c) => c.id === filterCalendarId);
      const targetCalId =
        filteredCal &&
        filteredCal.type !== 'HOLIDAY' &&
        (!user?.id || filteredCal.userId === user.id)
          ? filteredCal.id
          : undefined;
      const res = await calendarApi.importIcs(text, targetCalId);
      alert(`${res.imported}개의 일정을 가져왔습니다.`);
      await loadEvents();
    } catch (err: any) {
      alert(err?.message || 'ICS 가져오기에 실패했습니다.');
    } finally {
      if (icsInputRef.current) icsInputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-1 flex-col min-h-0 bg-white overflow-hidden">
      <input
        ref={icsInputRef}
        type="file"
        accept=".ics,text/calendar"
        onChange={handleImportIcsFile}
        className="hidden"
      />

      {/* 상단 통합 툴바 */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/[0.08] bg-white px-5 py-2.5 shrink-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleNavigate(0)}
            className="rounded-lg border border-black/[0.12] bg-white px-3 py-1.5 text-xs font-medium text-[#1d1d1f] hover:bg-black/[0.03] transition-colors"
          >
            오늘
          </button>
          <div className="flex items-center rounded-lg border border-black/[0.12] bg-white overflow-hidden">
            <button
              type="button"
              onClick={() => handleNavigate(-1)}
              className="p-1.5 text-[#6e6e73] hover:bg-black/[0.04] hover:text-[#1d1d1f] transition-colors"
              aria-label="이전 기간"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => handleNavigate(1)}
              className="p-1.5 text-[#6e6e73] hover:bg-black/[0.04] hover:text-[#1d1d1f] border-l border-black/[0.08] transition-colors"
              aria-label="다음 기간"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <h2 className="ml-1.5 text-[15px] font-semibold text-[#1d1d1f] tracking-tight">
            {formatPeriodTitle(anchorDate, view)}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-[#86868b] absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="일정 검색..."
              className="w-40 sm:w-48 rounded-lg border border-black/[0.12] bg-white pl-8 pr-3 py-1.5 text-xs text-[#1d1d1f] placeholder:text-[#86868b] focus:border-[#0071e3] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/20"
            />
          </div>

          <div className="inline-flex rounded-lg bg-black/[0.05] p-0.5">
            {VIEW_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setView(tab.key)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                  view === tab.key
                    ? 'bg-white text-[#1d1d1f] shadow-xs font-semibold'
                    : 'text-[#6e6e73] hover:text-[#1d1d1f]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-black/[0.08] hidden sm:block mx-0.5" />

          <button
            type="button"
            onClick={() => icsInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.12] bg-white px-2.5 py-1.5 text-xs font-medium text-[#1d1d1f] hover:bg-black/[0.03] transition-colors"
            title="iCalendar(.ics) 파일 가져오기"
          >
            <Upload className="h-3.5 w-3.5 text-[#6e6e73]" />
            <span className="hidden lg:inline">.ics 가져오기</span>
          </button>
          <button
            type="button"
            onClick={handleExportIcs}
            className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.12] bg-white px-2.5 py-1.5 text-xs font-medium text-[#1d1d1f] hover:bg-black/[0.03] transition-colors"
            title="현재 기간 일정을 .ics 파일로 내보내기"
          >
            <Download className="h-3.5 w-3.5 text-[#6e6e73]" />
            <span className="hidden lg:inline">.ics 내보내기</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingCalendar(null);
              setCalModalOpen(true);
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-black/[0.12] bg-white px-2.5 py-1.5 text-xs font-medium text-[#1d1d1f] hover:bg-black/[0.03] transition-colors"
          >
            <Plus className="h-3.5 w-3.5 text-[#6e6e73]" />
            <span>캘린더</span>
          </button>
          {!isReadOnlyCalendar && (
            <button
              type="button"
              onClick={() => handleOpenCreateEvent()}
              className="inline-flex items-center gap-1 rounded-lg bg-[#0071e3] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#0077ed] shadow-xs transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>새 일정</span>
            </button>
          )}
        </div>
      </div>

      {/* 내 캘린더 필터 바 */}
      {(() => {
        const displayedCalendars = filterCalendarId
          ? calendars.filter((cal) => cal.id === filterCalendarId)
          : calendars;

        if (displayedCalendars.length === 0) return null;

        return (
          <div className="flex flex-wrap items-center gap-1.5 bg-[#f5f5f7]/60 border-b border-black/[0.08] px-5 py-2 shrink-0">
            <span className="text-[11px] font-semibold text-[#6e6e73] mr-1">내 캘린더</span>
            {displayedCalendars.map((cal) => {
              const isActive = filterCalendarId ? true : cal.isVisible;
              const labelContent = (
                <>
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: cal.color }}
                  />
                  <span>{cal.name}</span>
                  {cal.type === 'SHARED' && (
                    <span className="rounded bg-[#0071e3]/10 px-1 py-0.5 text-[10px] font-semibold text-[#0071e3]">
                      공유
                    </span>
                  )}
                  {cal.type === 'HOLIDAY' && (
                    <span className="rounded bg-[#ff3b30]/10 px-1 py-0.5 text-[10px] font-semibold text-[#d70015]">
                      공휴일
                    </span>
                  )}
                </>
              );

              return (
                <div
                  key={cal.id}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                    isActive
                      ? 'border-black/[0.10] bg-white text-[#1d1d1f] shadow-2xs'
                      : 'border-black/[0.06] bg-transparent text-[#86868b] opacity-70'
                  }`}
                >
                  {filterCalendarId ? (
                    <div className="inline-flex items-center gap-1.5">{labelContent}</div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleToggleCalendarVisibility(cal)}
                      className="inline-flex items-center gap-1.5"
                      title={cal.isVisible ? '캘린더 숨기기' : '캘린더 표시하기'}
                    >
                      {labelContent}
                      {cal.isVisible ? (
                        <Eye className="h-3 w-3 text-[#86868b]" />
                      ) : (
                        <>
                          <EyeOff className="h-3 w-3 text-[#86868b]/70" />
                          <span className="text-[10px] text-[#86868b]">숨김</span>
                        </>
                      )}
                    </button>
                  )}
                  {(!user || cal.userId === user.id) && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCalendar(cal);
                        setCalModalOpen(true);
                      }}
                      className="ml-0.5 text-[#86868b] hover:text-[#1d1d1f] transition-colors"
                      title="캘린더 설정"
                    >
                      <Settings2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* 메인 캘린더 뷰 */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-white">
        {loading && events.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-xs text-[#86868b]">
            일정을 불러오는 중입니다...
          </div>
        ) : view === 'month' ? (
          <MonthView
            anchorDate={anchorDate}
            events={events}
            onSelectDate={(d) => handleOpenCreateEvent(d, false)}
            onSelectEvent={handleOpenEditEvent}
          />
        ) : view === 'week' || view === 'day' ? (
          <WeekDayView
            mode={view}
            anchorDate={anchorDate}
            events={events}
            onSelectSlot={(d, allDay) => handleOpenCreateEvent(d, Boolean(allDay))}
            onSelectEvent={handleOpenEditEvent}
          />
        ) : (
          <AgendaView events={events} onSelectEvent={handleOpenEditEvent} />
        )}
      </div>

      {/* 일정 등록/수정 모달 */}
      <EventModal
        isOpen={eventModalOpen}
        onClose={() => setEventModalOpen(false)}
        calendars={calendars}
        initialEvent={editingEvent}
        defaultDate={defaultModalDate}
        defaultIsAllDay={defaultModalAllDay}
        onSave={handleSaveEvent}
        onDelete={handleDeleteEvent}
      />

      {/* 캘린더 생성/수정 모달 */}
      <CalendarManageModal
        isOpen={calModalOpen}
        onClose={() => setCalModalOpen(false)}
        initialCalendar={editingCalendar}
        onSave={handleSaveCalendar}
        onDelete={handleDeleteCalendar}
      />
    </div>
  );
}

export default function CalendarPage() {
  return (
    <Suspense
      fallback={
        <div className="p-12 text-center text-xs text-slate-400">
          캘린더를 준비하고 있습니다...
        </div>
      }
    >
      <CalendarPageContent />
    </Suspense>
  );
}
