export type MailDateGroupKey =
  | 'today'
  | 'yesterday'
  | 'this-week'
  | 'last-week'
  | 'this-month'
  | 'last-month'
  | 'older';

export interface MailDateGroupInfo {
  key: MailDateGroupKey;
  label: string;
}

export interface MailDateGroup<T> {
  key: MailDateGroupKey;
  label: string;
  items: T[];
}

const GROUP_LABELS: Record<MailDateGroupKey, string> = {
  today: '오늘',
  yesterday: '어제',
  'this-week': '이번 주',
  'last-week': '지난 주',
  'this-month': '이번 달',
  'last-month': '지난 달',
  older: '이전',
};

/**
 * 메일 일시를 아웃룩 스타일의 날짜 그룹(오늘, 어제, 이번 주, 지난 주, 이번 달, 지난 달, 이전)으로 분류합니다.
 */
export function getMailDateGroup(
  dateInput: string | Date | null | undefined,
  nowInput: Date = new Date()
): MailDateGroupInfo {
  if (!dateInput) {
    return { key: 'older', label: GROUP_LABELS.older };
  }

  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) {
    return { key: 'older', label: GROUP_LABELS.older };
  }

  const startOfToday = new Date(nowInput.getFullYear(), nowInput.getMonth(), nowInput.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  // 일요일 시작 기준 이번 주 / 지난 주
  const startOfThisWeek = new Date(startOfToday);
  startOfThisWeek.setDate(startOfThisWeek.getDate() - startOfToday.getDay());

  const startOfLastWeek = new Date(startOfThisWeek);
  startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

  let key: MailDateGroupKey;
  if (d >= startOfToday) {
    key = 'today';
  } else if (d >= startOfYesterday) {
    key = 'yesterday';
  } else if (d >= startOfThisWeek) {
    key = 'this-week';
  } else if (d >= startOfLastWeek) {
    key = 'last-week';
  } else if (
    d.getFullYear() === nowInput.getFullYear() &&
    d.getMonth() === nowInput.getMonth()
  ) {
    key = 'this-month';
  } else {
    const lastMonthDate = new Date(nowInput.getFullYear(), nowInput.getMonth() - 1, 1);
    if (
      d.getFullYear() === lastMonthDate.getFullYear() &&
      d.getMonth() === lastMonthDate.getMonth()
    ) {
      key = 'last-month';
    } else {
      key = 'older';
    }
  }

  return { key, label: GROUP_LABELS[key] };
}

/**
 * 메일 목록을 날짜 그룹 순서에 따라 묶어 반환합니다.
 */
export function groupMailsByDate<T extends { createdAt: string | Date }>(
  mails: T[],
  nowInput: Date = new Date()
): MailDateGroup<T>[] {
  const groups: MailDateGroup<T>[] = [];
  const groupMap = new Map<MailDateGroupKey, MailDateGroup<T>>();

  for (const mail of mails) {
    const { key, label } = getMailDateGroup(mail.createdAt, nowInput);
    let group = groupMap.get(key);
    if (!group) {
      group = { key, label, items: [] };
      groupMap.set(key, group);
      groups.push(group);
    }
    group.items.push(mail);
  }

  return groups;
}
