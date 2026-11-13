export type CalendarViewType = 'month' | 'week' | 'day' | 'agenda';

export const CALENDAR_COLORS = [
  '#0284c7', // sky-600
  '#7c3aed', // violet-600
  '#059669', // emerald-600
  '#d97706', // amber-600
  '#e11d48', // rose-600
  '#0891b2', // cyan-600
  '#4f46e5', // indigo-600
  '#64748b', // slate-500
];

export const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function getMonthGridDays(anchor: Date): Date[] {
  const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const startDayOfWeek = firstOfMonth.getDay(); // 0 (Sun) - 6 (Sat)
  const gridStart = addDays(firstOfMonth, -startDayOfWeek);
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    days.push(addDays(gridStart, i));
  }
  return days;
}

export function getWeekDays(anchor: Date): Date[] {
  const start = addDays(startOfDay(anchor), -anchor.getDay());
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function getVisibleRange(
  anchor: Date,
  view: CalendarViewType,
): { start: Date; end: Date } {
  if (view === 'month') {
    const days = getMonthGridDays(anchor);
    return { start: startOfDay(days[0]), end: endOfDay(days[days.length - 1]) };
  }
  if (view === 'week') {
    const days = getWeekDays(anchor);
    return { start: startOfDay(days[0]), end: endOfDay(days[6]) };
  }
  if (view === 'day') {
    return { start: startOfDay(anchor), end: endOfDay(anchor) };
  }
  // agenda: current month +/- buffer
  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const monthEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  return { start: startOfDay(monthStart), end: endOfDay(monthEnd) };
}

export function formatDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatTimeInputValue(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function formatTimeShort(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function formatPeriodTitle(anchor: Date, view: CalendarViewType): string {
  const y = anchor.getFullYear();
  const m = anchor.getMonth() + 1;
  if (view === 'month' || view === 'agenda') {
    return `${y}년 ${m}월`;
  }
  if (view === 'day') {
    const dayLabel = WEEKDAY_LABELS[anchor.getDay()];
    return `${y}년 ${m}월 ${anchor.getDate()}일 (${dayLabel})`;
  }
  const week = getWeekDays(anchor);
  const start = week[0];
  const end = week[6];
  if (start.getMonth() === end.getMonth()) {
    return `${start.getFullYear()}년 ${start.getMonth() + 1}월 ${start.getDate()}일 – ${end.getDate()}일`;
  }
  return `${start.getFullYear()}년 ${start.getMonth() + 1}월 ${start.getDate()}일 – ${end.getMonth() + 1}월 ${end.getDate()}일`;
}

export function doesEventOverlapDay(
  eventStartIso: string,
  eventEndIso: string,
  day: Date,
): boolean {
  const evStart = new Date(eventStartIso);
  const evEnd = new Date(eventEndIso);
  const dStart = startOfDay(day);
  const dEnd = endOfDay(day);
  return evStart <= dEnd && evEnd >= dStart;
}
