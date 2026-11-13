'use client';

import React from 'react';
import { CalendarEventDto } from '@lemail/shared-types';
import { MapPin, Clock, CalendarDays } from 'lucide-react';
import { WEEKDAY_LABELS, formatTimeShort } from './dateUtils';

interface AgendaViewProps {
  events: CalendarEventDto[];
  onSelectEvent: (event: CalendarEventDto) => void;
}

export const AgendaView: React.FC<AgendaViewProps> = ({
  events,
  onSelectEvent,
}) => {
  const grouped = React.useMemo(() => {
    const map = new Map<string, CalendarEventDto[]>();
    const sorted = [...events].sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
    );
    for (const ev of sorted) {
      const d = new Date(ev.startAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    return Array.from(map.entries());
  }, [events]);

  if (grouped.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
        <CalendarDays className="h-10 w-10 text-slate-300 mx-auto mb-3" />
        <p className="text-sm font-semibold text-slate-700">등록된 일정이 없습니다.</p>
        <p className="text-xs text-slate-400 mt-1">
          우측 상단의 &lsquo;새 일정&rsquo; 버튼을 눌러 일정을 추가해 보세요.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">
      {grouped.map(([dateKey, dayEvents]) => {
        const d = new Date(`${dateKey}T00:00:00`);
        const label = `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAY_LABELS[d.getDay()]})`;

        return (
          <div key={dateKey} className="p-4 sm:p-5 flex flex-col sm:flex-row gap-4">
            <div className="w-36 shrink-0">
              <div className="text-sm font-bold text-slate-900">{label}</div>
              <div className="text-[11px] text-slate-400 font-mono">{dateKey}</div>
            </div>

            <div className="flex-1 space-y-2">
              {dayEvents.map((ev) => {
                const color = ev.calendarColor || '#0284c7';
                return (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => onSelectEvent(ev)}
                    className="w-full text-left rounded-xl border border-slate-200/80 p-3 hover:border-sky-300 hover:bg-sky-50/30 transition flex items-start justify-between gap-3"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <span
                        className="mt-1.5 h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 truncate">
                          {ev.title}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-500">
                          <span className="inline-flex items-center gap-1 font-mono">
                            <Clock className="h-3 w-3 text-slate-400" />
                            {ev.isAllDay
                              ? '종일'
                              : `${formatTimeShort(ev.startAt)} ~ ${formatTimeShort(ev.endAt)}`}
                          </span>
                          {ev.location && (
                            <span className="inline-flex items-center gap-1 truncate">
                              <MapPin className="h-3 w-3 text-slate-400" />
                              {ev.location}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {ev.calendarName && (
                      <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                        {ev.calendarName}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
