'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { CalendarEventDto } from '@lemail/shared-types';
import {
  WEEKDAY_LABELS,
  getMonthGridDays,
  isSameDay,
  doesEventOverlapDay,
  formatTimeShort,
  layoutWeekSpanEvents,
} from './dateUtils';

interface MonthViewProps {
  anchorDate: Date;
  events: CalendarEventDto[];
  onSelectDate: (date: Date) => void;
  onSelectEvent: (event: CalendarEventDto) => void;
}

const MAX_LANES = 3;

export const MonthView: React.FC<MonthViewProps> = ({
  anchorDate,
  events,
  onSelectDate,
  onSelectEvent,
}) => {
  const days = React.useMemo(() => getMonthGridDays(anchorDate), [anchorDate]);
  const weeks = React.useMemo(() => {
    const result: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      result.push(days.slice(i, i + 7));
    }
    return result;
  }, [days]);

  const [moreModalDay, setMoreModalDay] = useState<Date | null>(null);
  const today = new Date();
  const currentMonth = anchorDate.getMonth();

  const moreDayEvents = React.useMemo(() => {
    if (!moreModalDay) return [];
    return events.filter((ev) =>
      doesEventOverlapDay(ev.startAt, ev.endAt, moreModalDay),
    );
  }, [moreModalDay, events]);

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

      {/* 6주 x 7일 주 단위 행 */}
      <div className="divide-y divide-slate-100">
        {weeks.map((weekDays, weekIdx) => {
          const lanes = layoutWeekSpanEvents(weekDays, events);
          const visibleLanes = lanes.slice(0, MAX_LANES);
          const hiddenLanes = lanes.slice(MAX_LANES);

          // 날짜별 숨겨진 일정 개수 계산
          const overflowCounts = Array.from({ length: 7 }, (_, col) => {
            let count = 0;
            for (const lane of hiddenLanes) {
              if (lane.some((item) => col >= item.startCol && col <= item.endCol)) {
                count++;
              }
            }
            return count;
          });

          return (
            <div key={`week-${weekIdx}`} className="relative min-h-[122px]">
              {/* 배경 날짜 셀 레이어 */}
              <div className="grid grid-cols-7 divide-x divide-slate-100 min-h-[122px]">
                {weekDays.map((day, colIdx) => {
                  const isCurrentMonth = day.getMonth() === currentMonth;
                  const isToday = isSameDay(day, today);
                  const dayOfWeek = day.getDay();
                  const overflowCount = overflowCounts[colIdx];

                  return (
                    <div
                      key={day.toISOString()}
                      onClick={() => onSelectDate(day)}
                      className={`p-1.5 sm:p-2 cursor-pointer transition-colors hover:bg-sky-50/40 flex flex-col justify-between ${
                        isCurrentMonth ? 'bg-white' : 'bg-slate-50/60'
                      }`}
                    >
                      <div className="flex items-center justify-between">
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

                      {overflowCount > 0 ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMoreModalDay(day);
                          }}
                          className="mt-auto pt-1 text-left px-1 text-[10px] font-semibold text-slate-500 hover:text-sky-600 z-10"
                        >
                          +{overflowCount}개 더보기
                        </button>
                      ) : (
                        <div className="h-3" />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 연결된 일정 바 오버레이 레이어 */}
              {visibleLanes.length > 0 && (
                <div className="absolute left-0 right-0 top-8 px-0.5 space-y-1 pointer-events-none">
                  {visibleLanes.map((lane, laneIdx) => (
                    <div
                      key={`lane-${weekIdx}-${laneIdx}`}
                      className="grid grid-cols-7 gap-x-0.5 items-center"
                    >
                      {lane.map((item) => {
                        const ev = item.event;
                        const color = ev.calendarColor || '#0284c7';
                        const isSolidBar = ev.isAllDay || item.isMultiDay;

                        const radiusClass =
                          item.continuesFromPrev && item.continuesToNext
                            ? 'rounded-none'
                            : item.continuesFromPrev
                            ? 'rounded-l-none rounded-r-md'
                            : item.continuesToNext
                            ? 'rounded-l-md rounded-r-none'
                            : 'rounded-md';

                        return (
                          <button
                            key={`${ev.id}-${weekIdx}-${item.startCol}`}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectEvent(ev);
                            }}
                            style={{
                              gridColumn: `${item.startCol + 1} / span ${item.span}`,
                              backgroundColor: isSolidBar ? color : `${color}18`,
                              color: isSolidBar ? '#ffffff' : '#0f172a',
                              borderLeft:
                                !isSolidBar && !item.continuesFromPrev
                                  ? `3px solid ${color}`
                                  : undefined,
                            }}
                            className={`pointer-events-auto h-[22px] w-full text-left flex items-center gap-1.5 px-2 text-[11px] font-medium truncate transition hover:opacity-90 shadow-2xs ${radiusClass}`}
                            title={ev.title}
                          >
                            {!ev.isAllDay && !item.continuesFromPrev && (
                              <span
                                className={`text-[10px] font-mono shrink-0 ${
                                  isSolidBar ? 'text-white/85' : 'text-slate-500'
                                }`}
                              >
                                {formatTimeShort(ev.startAt)}
                              </span>
                            )}
                            <span className="truncate font-semibold">
                              {ev.title}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* +N개 더보기 팝업 모달 */}
      {moreModalDay && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4"
          onClick={() => setMoreModalDay(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/70">
              <span className="text-sm font-bold text-slate-900">
                {moreModalDay.getFullYear()}년 {moreModalDay.getMonth() + 1}월{' '}
                {moreModalDay.getDate()}일 ({WEEKDAY_LABELS[moreModalDay.getDay()]})
              </span>
              <button
                type="button"
                onClick={() => setMoreModalDay(null)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-3 space-y-1.5 max-h-80 overflow-y-auto">
              {moreDayEvents.map((ev) => {
                const color = ev.calendarColor || '#0284c7';
                return (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => {
                      setMoreModalDay(null);
                      onSelectEvent(ev);
                    }}
                    className="w-full text-left flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs hover:bg-slate-50 border border-slate-100 transition"
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span className="font-mono text-[11px] text-slate-500 shrink-0">
                      {ev.isAllDay ? '종일' : formatTimeShort(ev.startAt)}
                    </span>
                    <span className="font-semibold text-slate-800 truncate">
                      {ev.title}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
