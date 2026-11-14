'use client';

import React, { useEffect, useRef, useState } from 'react';
import { CalendarEventDto } from '@lemail/shared-types';
import {
  WEEKDAY_LABELS,
  getWeekDays,
  isSameDay,
  doesEventOverlapDay,
  formatTimeShort,
  layoutWeekSpanEvents,
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
  const [now, setNow] = useState<Date>(() => new Date());
  const days = React.useMemo(
    () => (mode === 'week' ? getWeekDays(anchorDate) : [anchorDate]),
    [mode, anchorDate],
  );
  const today = now;

  // 현지 시간 분 단위 실시간 업데이트 (매 분 정각 동기화)
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const current = new Date();
    const msUntilNextMinute =
      (60 - current.getSeconds()) * 1000 - current.getMilliseconds() + 20;

    const timeoutId = setTimeout(() => {
      setNow(new Date());
      intervalId = setInterval(() => {
        setNow(new Date());
      }, 60_000);
    }, Math.max(50, msUntilNextMinute));

    return () => {
      clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowTopPx = (nowMinutes / 60) * 56;
  const nowLabel = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const allDayEvents = React.useMemo(
    () => events.filter((ev) => ev.isAllDay),
    [events],
  );
  const allDayLanes = React.useMemo(
    () => layoutWeekSpanEvents(days, allDayEvents),
    [days, allDayEvents],
  );

  // 기본 스크롤을 오전 8시 근처로 이동
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 8 * 56;
    }
  }, [mode]);

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-white overflow-hidden">
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
        {/* 상단 고정 헤더(요일 + 종일): 스크롤 컨테이너 내부에 sticky로 배치해 스크롤바 너비로 인한 컬럼 단차 방지 */}
        <div className="sticky top-0 z-30 bg-white">
          {/* 날짜 헤더 */}
          <div
            className="grid border-b border-black/[0.08] bg-[#f5f5f7]/70"
            style={{ gridTemplateColumns: `64px repeat(${days.length}, minmax(0, 1fr))` }}
          >
        <div className="py-3 text-center text-[11px] font-semibold text-[#86868b] border-r border-black/[0.08]">
          시간
        </div>
        {days.map((day) => {
          const isToday = isSameDay(day, today);
          const dow = day.getDay();
          return (
            <div
              key={day.toISOString()}
              className={`py-2 px-2 text-center border-r last:border-r-0 border-black/[0.06] ${
                isToday ? 'bg-[#0071e3]/[0.04]' : ''
              }`}
            >
              <div
                className={`text-[11px] font-semibold ${
                  dow === 0
                    ? 'text-[#ff3b30]'
                    : dow === 6
                    ? 'text-[#0071e3]'
                    : 'text-[#6e6e73]'
                }`}
              >
                {WEEKDAY_LABELS[dow]}
              </div>
              <div
                className={`mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${
                  isToday ? 'bg-[#0071e3] text-white shadow-xs' : 'text-[#1d1d1f]'
                }`}
              >
                {day.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* 종일 일정 행 (다일 연결 바 지원) */}
      <div
        className="grid border-b border-black/[0.08] bg-[#f5f5f7]/35 shrink-0"
        style={{ gridTemplateColumns: `64px minmax(0, 1fr)` }}
      >
        <div className="py-2 px-1 text-center text-[10px] font-semibold text-[#86868b] border-r border-black/[0.08] flex items-center justify-center">
          종일
        </div>
        <div className="relative min-h-[38px]">
          {/* 배경 클릭 셀 */}
          <div
            className="grid h-full min-h-[38px]"
            style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
          >
            {days.map((day) => (
              <div
                key={`allday-bg-${day.toISOString()}`}
                onClick={() => onSelectSlot(day, true)}
                className="border-r last:border-r-0 border-black/[0.06] cursor-pointer hover:bg-[#0071e3]/[0.03] transition-colors"
              />
            ))}
          </div>

          {/* 연결된 종일 일정 바 */}
          {allDayLanes.length > 0 && (
            <div className="relative z-10 -mt-[38px] p-1 space-y-1 pointer-events-none">
              {allDayLanes.map((lane, laneIdx) => (
                <div
                  key={`allday-lane-${laneIdx}`}
                  className="grid gap-x-0.5"
                  style={{
                    gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
                  }}
                >
                  {lane.map((item) => {
                    const ev = item.event;
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
                        key={`allday-${ev.id}-${item.startCol}`}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectEvent(ev);
                        }}
                        style={{
                          gridColumn: `${item.startCol + 1} / span ${item.span}`,
                          backgroundColor: ev.calendarColor || '#0284c7',
                        }}
                        className={`pointer-events-auto w-full text-left px-2 py-0.5 text-[11px] font-semibold text-white truncate hover:opacity-90 ${radiusClass}`}
                      >
                        {ev.title}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
        </div>
      </div>

      {/* 시간대 그리드 */}
        <div
          className="grid relative"
          style={{ gridTemplateColumns: `64px repeat(${days.length}, minmax(0, 1fr))` }}
        >
          {/* 시간 라벨 열 */}
          <div className="border-r border-black/[0.08] bg-[#f5f5f7]/35">
            {HOURS.map((h) => {
              const isNearNow = Math.abs(h * 60 - nowMinutes) <= 14;
              return (
                <div
                  key={h}
                  className="h-14 pr-2 text-right text-[11px] font-mono text-[#86868b] pt-1 border-b border-black/[0.06]"
                >
                  <span className={isNearNow ? 'opacity-0' : ''}>
                    {String(h).padStart(2, '0')}:00
                  </span>
                </div>
              );
            })}
          </div>

          {/* 현재 시간 라벨 및 가로 기준선 (24시간제, 분 단위 업데이트) */}
          <div
            style={{ top: `${nowTopPx}px` }}
            className="pointer-events-none absolute left-0 w-[64px] -translate-y-1/2 pr-2 text-right text-[11px] font-mono font-semibold text-[#ff3b30] z-20"
          >
            {nowLabel}
          </div>
          <div
            style={{ top: `${nowTopPx}px` }}
            className="pointer-events-none absolute left-[64px] right-0 h-[1.5px] bg-[#ff3b30] -translate-y-1/2 z-20"
          />

          {/* 요일별 시간 슬롯 */}
          {days.map((day) => {
            const isTodayCol = isSameDay(day, today);
            const timedEvents = events.filter(
              (ev) => !ev.isAllDay && doesEventOverlapDay(ev.startAt, ev.endAt, day),
            );

            return (
              <div
                key={`col-${day.toISOString()}`}
                className={`relative border-r last:border-r-0 border-black/[0.06] ${
                  isTodayCol ? 'bg-[#0071e3]/[0.015]' : ''
                }`}
              >
                {isTodayCol && (
                  <span
                    style={{ top: `${nowTopPx}px` }}
                    className="pointer-events-none absolute left-0 -translate-x-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full bg-[#ff3b30] ring-2 ring-white z-20"
                  />
                )}
                {HOURS.map((h) => (
                  <div
                    key={h}
                    onClick={() => {
                      const slotDate = new Date(day);
                      slotDate.setHours(h, 0, 0, 0);
                      onSelectSlot(slotDate, false);
                    }}
                    className="h-14 border-b border-black/[0.06] hover:bg-[#0071e3]/[0.03] cursor-pointer transition-colors"
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
                      <div className="text-[11px] font-semibold text-[#1d1d1f] truncate">
                        {ev.title}
                      </div>
                      <div className="text-[10px] font-mono text-[#6e6e73] truncate">
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
