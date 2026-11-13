'use client';

import React, { useEffect, useRef } from 'react';
import { CalendarEventDto } from '@lemail/shared-types';
import {
  WEEKDAY_LABELS,
  getWeekDays,
  isSameDay,
  doesEventOverlapDay,
  formatTimeShort,
} from './dateUtils';

interface WeekDayViewProps {
  mode: 'week' | 'day';
  anchorDate: Date;
  events: CalendarEventDto[];
  onSelectSlot: (date: Date, isAllDay?: boolean) => void;
  onSelectEvent: (event: CalendarEventDto) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export const WeekDayView: React.FC<WeekDayViewProps> = ({
  mode,
  anchorDate,
  events,
  onSelectSlot,
  onSelectEvent,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const days = React.useMemo(
    () => (mode === 'week' ? getWeekDays(anchorDate) : [anchorDate]),
    [mode, anchorDate],
  );
  const today = new Date();

  // 기본 스크롤을 오전 8시 근처로 이동
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 8 * 56;
    }
  }, [mode]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
      {/* 날짜 헤더 */}
      <div className="grid border-b border-slate-200 bg-slate-50/80" style={{ gridTemplateColumns: `64px repeat(${days.length}, minmax(0, 1fr))` }}>
        <div className="py-3 text-center text-[11px] font-semibold text-slate-400 border-r border-slate-200">
          시간
        </div>
        {days.map((day) => {
          const isToday = isSameDay(day, today);
          const dow = day.getDay();
          return (
            <div
              key={day.toISOString()}
              className={`py-2.5 px-2 text-center border-r last:border-r-0 border-slate-100 ${
                isToday ? 'bg-sky-50/70' : ''
              }`}
            >
              <div
                className={`text-[11px] font-semibold ${
                  dow === 0
                    ? 'text-rose-500'
                    : dow === 6
                    ? 'text-sky-600'
                    : 'text-slate-500'
                }`}
              >
                {WEEKDAY_LABELS[dow]}
              </div>
              <div
                className={`mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${
                  isToday ? 'bg-sky-600 text-white' : 'text-slate-800'
                }`}
              >
                {day.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* 종일 일정 행 */}
      <div
        className="grid border-b border-slate-200 bg-slate-50/40"
        style={{ gridTemplateColumns: `64px repeat(${days.length}, minmax(0, 1fr))` }}
      >
        <div className="py-2 px-1 text-center text-[10px] font-semibold text-slate-400 border-r border-slate-200 flex items-center justify-center">
          종일
        </div>
        {days.map((day) => {
          const allDayEvents = events.filter(
            (ev) => ev.isAllDay && doesEventOverlapDay(ev.startAt, ev.endAt, day),
          );
          return (
            <div
              key={`allday-${day.toISOString()}`}
              onClick={() => onSelectSlot(day, true)}
              className="min-h-[36px] p-1 space-y-1 border-r last:border-r-0 border-slate-100 cursor-pointer hover:bg-sky-50/40"
            >
              {allDayEvents.map((ev) => (
                <button
                  key={ev.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectEvent(ev);
                  }}
                  className="w-full text-left rounded px-1.5 py-0.5 text-[11px] font-semibold text-white truncate"
                  style={{ backgroundColor: ev.calendarColor || '#0284c7' }}
                >
                  {ev.title}
                </button>
              ))}
            </div>
          );
        })}
      </div>

      {/* 시간대 그리드 */}
      <div ref={scrollRef} className="overflow-y-auto max-h-[600px]">
        <div
          className="grid relative"
          style={{ gridTemplateColumns: `64px repeat(${days.length}, minmax(0, 1fr))` }}
        >
          {/* 시간 라벨 열 */}
          <div className="border-r border-slate-200 bg-slate-50/30">
            {HOURS.map((h) => (
              <div
                key={h}
                className="h-14 pr-2 text-right text-[11px] font-mono text-slate-400 pt-1 border-b border-slate-100"
              >
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {/* 요일별 시간 슬롯 */}
          {days.map((day) => {
            const timedEvents = events.filter(
              (ev) => !ev.isAllDay && doesEventOverlapDay(ev.startAt, ev.endAt, day),
            );

            return (
              <div
                key={`col-${day.toISOString()}`}
                className="relative border-r last:border-r-0 border-slate-100"
              >
                {HOURS.map((h) => (
                  <div
                    key={h}
                    onClick={() => {
                      const slotDate = new Date(day);
                      slotDate.setHours(h, 0, 0, 0);
                      onSelectSlot(slotDate, false);
                    }}
                    className="h-14 border-b border-slate-100 hover:bg-sky-50/40 cursor-pointer transition-colors"
                  />
                ))}

                {/* 일정 블록 오버레이 */}
                {timedEvents.map((ev) => {
                  const start = new Date(ev.startAt);
                  const end = new Date(ev.endAt);
                  const dayStart = new Date(day);
                  dayStart.setHours(0, 0, 0, 0);
                  const dayEnd = new Date(day);
                  dayEnd.setHours(23, 59, 59, 999);

                  const clampedStart = start < dayStart ? dayStart : start;
                  const clampedEnd = end > dayEnd ? dayEnd : end;

                  const startMinutes =
                    clampedStart.getHours() * 60 + clampedStart.getMinutes();
                  const endMinutes =
                    clampedEnd.getHours() * 60 + clampedEnd.getMinutes();
                  const durationMinutes = Math.max(30, endMinutes - startMinutes);

                  const topPx = (startMinutes / 60) * 56;
                  const heightPx = Math.max(24, (durationMinutes / 60) * 56);
                  const color = ev.calendarColor || '#0284c7';

                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectEvent(ev);
                      }}
                      style={{
                        top: `${topPx}px`,
                        height: `${heightPx}px`,
                        backgroundColor: `${color}1f`,
                        borderLeft: `3px solid ${color}`,
                      }}
                      className="absolute left-1 right-1 rounded-lg px-2 py-1 text-left overflow-hidden shadow-xs hover:shadow-md transition z-10"
                    >
                      <div className="text-[11px] font-bold text-slate-900 truncate">
                        {ev.title}
                      </div>
                      <div className="text-[10px] font-mono text-slate-600 truncate">
                        {formatTimeShort(ev.startAt)} - {formatTimeShort(ev.endAt)}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
