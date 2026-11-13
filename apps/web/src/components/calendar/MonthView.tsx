'use client';

import React from 'react';
import { CalendarEventDto } from '@lemail/shared-types';
import {
  WEEKDAY_LABELS,
  getMonthGridDays,
  isSameDay,
  doesEventOverlapDay,
  formatTimeShort,
} from './dateUtils';

interface MonthViewProps {
  anchorDate: Date;
  events: CalendarEventDto[];
  onSelectDate: (date: Date) => void;
  onSelectEvent: (event: CalendarEventDto) => void;
}

export const MonthView: React.FC<MonthViewProps> = ({
  anchorDate,
  events,
  onSelectDate,
  onSelectEvent,
}) => {
  const days = React.useMemo(() => getMonthGridDays(anchorDate), [anchorDate]);
  const today = new Date();
  const currentMonth = anchorDate.getMonth();

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/80">
        {WEEKDAY_LABELS.map((label, idx) => (
          <div
            key={label}
            className={`py-2.5 text-center text-xs font-bold tracking-wide ${
              idx === 0
                ? 'text-rose-500'
                : idx === 6
                ? 'text-sky-600'
                : 'text-slate-600'
            }`}
          >
            {label}
          </div>
        ))}
      </div>

      {/* 6주 x 7일 그리드 */}
      <div className="grid grid-cols-7 divide-x divide-y divide-slate-100">
        {days.map((day) => {
          const isCurrentMonth = day.getMonth() === currentMonth;
          const isToday = isSameDay(day, today);
          const dayOfWeek = day.getDay();
          const dayEvents = events.filter((ev) =>
            doesEventOverlapDay(ev.startAt, ev.endAt, day),
          );
          const visibleEvents = dayEvents.slice(0, 3);
          const overflowCount = dayEvents.length - visibleEvents.length;

          return (
            <div
              key={day.toISOString()}
              onClick={() => onSelectDate(day)}
              className={`min-h-[116px] p-1.5 sm:p-2 cursor-pointer transition-colors hover:bg-sky-50/40 flex flex-col ${
                isCurrentMonth ? 'bg-white' : 'bg-slate-50/60'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                    isToday
                      ? 'bg-sky-600 text-white shadow-sm'
                      : !isCurrentMonth
                      ? 'text-slate-300'
                      : dayOfWeek === 0
                      ? 'text-rose-500'
                      : dayOfWeek === 6
                      ? 'text-sky-600'
                      : 'text-slate-700'
                  }`}
                >
                  {day.getDate()}
                </span>
              </div>

              <div className="space-y-1 flex-1 overflow-hidden">
                {visibleEvents.map((ev) => {
                  const color = ev.calendarColor || '#0284c7';
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectEvent(ev);
                      }}
                      className="w-full text-left flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium truncate transition hover:opacity-85"
                      style={{
                        backgroundColor: ev.isAllDay ? color : `${color}18`,
                        color: ev.isAllDay ? '#ffffff' : '#0f172a',
                        borderLeft: ev.isAllDay ? undefined : `3px solid ${color}`,
                      }}
                      title={ev.title}
                    >
                      {!ev.isAllDay && (
                        <span className="text-[10px] font-mono text-slate-500 shrink-0">
                          {formatTimeShort(ev.startAt)}
                        </span>
                      )}
                      <span className="truncate">{ev.title}</span>
                    </button>
                  );
                })}
                {overflowCount > 0 && (
                  <div className="px-1.5 text-[10px] font-semibold text-slate-500">
                    +{overflowCount}개 더보기
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
