export interface KoreanHolidayItem {
  date: string; // YYYY-MM-DD
  name: string;
}

const FIXED_HOLIDAYS: { month: number; day: number; name: string }[] = [
  { month: 1, day: 1, name: '신정' },
  { month: 3, day: 1, name: '삼일절' },
  { month: 5, day: 5, name: '어린이날' },
  { month: 6, day: 6, name: '현충일' },
  { month: 8, day: 15, name: '광복절' },
  { month: 10, day: 3, name: '개천절' },
  { month: 10, day: 9, name: '한글날' },
  { month: 12, day: 25, name: '성탄절' },
];

// 음력/대체공휴일 (2025 ~ 2027)
const LUNAR_AND_SUBSTITUTE_HOLIDAYS: Record<string, string[]> = {
  '2025-01-28': ['설날 연휴'],
  '2025-01-29': ['설날'],
  '2025-01-30': ['설날 연휴'],
  '2025-03-03': ['대체공휴일(삼일절)'],
  '2025-05-05': ['부처님오신날'],
  '2025-05-06': ['대체공휴일(어린이날)'],
  '2025-10-05': ['추석 연휴'],
  '2025-10-06': ['추석'],
  '2025-10-07': ['추석 연휴'],
  '2025-10-08': ['대체공휴일(추석)'],
  '2026-02-16': ['설날 연휴'],
  '2026-02-17': ['설날'],
  '2026-02-18': ['설날 연휴'],
  '2026-03-02': ['대체공휴일(삼일절)'],
  '2026-05-24': ['부처님오신날'],
  '2026-05-25': ['대체공휴일(부처님오신날)'],
  '2026-08-17': ['대체공휴일(광복절)'],
  '2026-09-24': ['추석 연휴'],
  '2026-09-25': ['추석'],
  '2026-09-26': ['추석 연휴'],
  '2026-10-05': ['대체공휴일(개천절)'],
  '2027-02-06': ['설날 연휴'],
  '2027-02-07': ['설날'],
  '2027-02-08': ['설날 연휴'],
  '2027-02-09': ['대체공휴일(설날)'],
  '2027-05-13': ['부처님오신날'],
  '2027-08-16': ['대체공휴일(광복절)'],
  '2027-09-14': ['추석 연휴'],
  '2027-09-15': ['추석'],
  '2027-09-16': ['추석 연휴'],
  '2027-10-04': ['대체공휴일(개천절)'],
  '2027-10-11': ['대체공휴일(한글날)'],
};

export function getKoreanHolidaysInRange(
  start: Date,
  end: Date,
): KoreanHolidayItem[] {
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();
  const byDate = new Map<string, string[]>();

  for (let y = startYear; y <= endYear; y++) {
    for (const fh of FIXED_HOLIDAYS) {
      const key = `${y}-${String(fh.month).padStart(2, '0')}-${String(fh.day).padStart(2, '0')}`;
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key)!.push(fh.name);
    }
  }

  for (const [dateStr, names] of Object.entries(LUNAR_AND_SUBSTITUTE_HOLIDAYS)) {
    if (!byDate.has(dateStr)) byDate.set(dateStr, []);
    for (const n of names) {
      if (!byDate.get(dateStr)!.includes(n)) {
        byDate.get(dateStr)!.push(n);
      }
    }
  }

  const results: KoreanHolidayItem[] = [];
  for (const [dateStr, names] of byDate.entries()) {
    const d = new Date(`${dateStr}T12:00:00`);
    if (d >= start && d <= end) {
      results.push({ date: dateStr, name: names.join(' · ') });
    }
  }

  return results.sort((a, b) => a.date.localeCompare(b.date));
}
