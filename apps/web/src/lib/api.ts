const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

export async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}/api${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('lemail_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...options?.headers,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      // 세션 만료 또는 미인증 에러 발생 시 로컬 세션 클리어 및 로그인 페이지 이동
      if (typeof window !== 'undefined') {
        localStorage.removeItem('lemail_token');
        localStorage.removeItem('lemail_user');
        if (!window.location.pathname.startsWith('/login')) {
          window.location.href = '/login?reason=session_expired';
        }
      }
    }

    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message || `API request failed with status ${response.status}`);
  }

  return response.json();
}

export const licenseApi = {
  getStatus: () => fetchApi<import('@lemail/shared-types').SystemLicenseInfo>('/admin/license/status'),
  register: (licenseContent: string) =>
    fetchApi<import('@lemail/shared-types').SystemLicenseInfo>('/admin/license/register', {
      method: 'POST',
      body: JSON.stringify({ licenseContent }),
    }),
};

export const contactsApi = {
  getContacts: (params?: {
    search?: string;
    groupId?: string;
    page?: number;
    limit?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set('search', params.search);
    if (params?.groupId) searchParams.set('groupId', params.groupId);
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    const qs = searchParams.toString();
    return fetchApi<{
      items: import('@lemail/shared-types').ContactDto[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    }>(`/contacts${qs ? `?${qs}` : ''}`);
  },

  getCompanyUsers: () =>
    fetchApi<import('@lemail/shared-types').UserDto[]>('/contacts/company-users'),

  getContactById: (id: string) =>
    fetchApi<import('@lemail/shared-types').ContactDto>(`/contacts/${id}`),

  createContact: (dto: import('@lemail/shared-types').CreateContactDto) =>
    fetchApi<import('@lemail/shared-types').ContactDto>('/contacts', {
      method: 'POST',
      body: JSON.stringify(dto),
    }),

  updateContact: (id: string, dto: import('@lemail/shared-types').UpdateContactDto) =>
    fetchApi<import('@lemail/shared-types').ContactDto>(`/contacts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    }),

  deleteContact: (id: string) =>
    fetchApi<{ success: boolean; id: string }>(`/contacts/${id}`, {
      method: 'DELETE',
    }),

  bulkDeleteContacts: (ids: string[]) =>
    fetchApi<{ success: boolean; count: number }>('/contacts/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),

  toggleStar: (id: string) =>
    fetchApi<import('@lemail/shared-types').ContactDto>(`/contacts/${id}/star`, {
      method: 'PATCH',
    }),

  search: (q: string) =>
    fetchApi<import('@lemail/shared-types').ContactSearchResultDto[]>(
      `/contacts/search?q=${encodeURIComponent(q)}`,
    ),

  getGroups: () =>
    fetchApi<import('@lemail/shared-types').ContactGroupDto[]>('/contacts/groups'),

  createGroup: (dto: import('@lemail/shared-types').CreateContactGroupDto) =>
    fetchApi<import('@lemail/shared-types').ContactGroupDto>('/contacts/groups', {
      method: 'POST',
      body: JSON.stringify(dto),
    }),

  updateGroup: (id: string, dto: import('@lemail/shared-types').UpdateContactGroupDto) =>
    fetchApi<import('@lemail/shared-types').ContactGroupDto>(`/contacts/groups/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    }),

  deleteGroup: (id: string) =>
    fetchApi<{ success: boolean; id: string }>(`/contacts/groups/${id}`, {
      method: 'DELETE',
    }),

  importContacts: (dto: {
    fileContent: string;
    filename: string;
    duplicateAction?: import('@lemail/shared-types').DuplicateContactAction;
  }) =>
    fetchApi<import('@lemail/shared-types').ImportContactsResultDto>('/contacts/import', {
      method: 'POST',
      body: JSON.stringify(dto),
    }),
};

export const calendarApi = {
  getCalendars: () =>
    fetchApi<import('@lemail/shared-types').CalendarDto[]>('/calendar/calendars'),

  createCalendar: (dto: import('@lemail/shared-types').CreateCalendarDto) =>
    fetchApi<import('@lemail/shared-types').CalendarDto>('/calendar/calendars', {
      method: 'POST',
      body: JSON.stringify(dto),
    }),

  updateCalendar: (id: string, dto: import('@lemail/shared-types').UpdateCalendarDto) =>
    fetchApi<import('@lemail/shared-types').CalendarDto>(`/calendar/calendars/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    }),

  deleteCalendar: (id: string) =>
    fetchApi<{ deleted: boolean }>(`/calendar/calendars/${id}`, {
      method: 'DELETE',
    }),

  getEvents: (params?: {
    start?: string;
    end?: string;
    calendarIds?: string[];
    search?: string;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.start) searchParams.set('start', params.start);
    if (params?.end) searchParams.set('end', params.end);
    if (params?.calendarIds && params.calendarIds.length > 0) {
      searchParams.set('calendarIds', params.calendarIds.join(','));
    }
    if (params?.search) searchParams.set('search', params.search);
    const qs = searchParams.toString();
    return fetchApi<import('@lemail/shared-types').CalendarEventDto[]>(
      `/calendar/events${qs ? `?${qs}` : ''}`,
    );
  },

  createEvent: (dto: import('@lemail/shared-types').CreateCalendarEventDto) =>
    fetchApi<import('@lemail/shared-types').CalendarEventDto>('/calendar/events', {
      method: 'POST',
      body: JSON.stringify(dto),
    }),

  updateEvent: (id: string, dto: import('@lemail/shared-types').UpdateCalendarEventDto) =>
    fetchApi<import('@lemail/shared-types').CalendarEventDto>(`/calendar/events/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    }),

  deleteEvent: (id: string) =>
    fetchApi<{ deleted: boolean }>(`/calendar/events/${id}`, {
      method: 'DELETE',
    }),

  importIcs: (icsContent: string, calendarId?: string) =>
    fetchApi<{ imported: number }>('/calendar/import-ics', {
      method: 'POST',
      body: JSON.stringify({ icsContent, calendarId }),
    }),

  exportIcs: async (params?: { start?: string; end?: string; calendarIds?: string[] }) => {
    const searchParams = new URLSearchParams();
    if (params?.start) searchParams.set('start', params.start);
    if (params?.end) searchParams.set('end', params.end);
    if (params?.calendarIds && params.calendarIds.length > 0) {
      searchParams.set('calendarIds', params.calendarIds.join(','));
    }
    const qs = searchParams.toString();
    const token = typeof window !== 'undefined' ? localStorage.getItem('lemail_token') : null;
    const res = await fetch(`${API_BASE_URL}/api/calendar/export-ics${qs ? `?${qs}` : ''}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      throw new Error('ICS 내보내기에 실패했습니다.');
    }
    return res.blob();
  },
};

export const adminHolidaysApi = {
  listByYear: (year: number) =>
    fetchApi<import('@lemail/shared-types').SystemHolidayDto[]>(
      `/admin/holidays?year=${year}`,
    ),

  getSyncSettings: () =>
    fetchApi<import('@lemail/shared-types').HolidaySyncSettingsDto>(
      '/admin/holidays/settings',
    ),

  saveSyncSettings: (dto: {
    autoSyncEnabled?: boolean;
    kasiApiKey?: string;
    icsFeedUrl?: string;
  }) =>
    fetchApi<import('@lemail/shared-types').HolidaySyncSettingsDto>(
      '/admin/holidays/settings',
      {
        method: 'PATCH',
        body: JSON.stringify(dto),
      },
    ),

  syncNow: (years?: number[]) =>
    fetchApi<import('@lemail/shared-types').HolidaySyncResultDto>(
      '/admin/holidays/sync',
      {
        method: 'POST',
        body: JSON.stringify({ years }),
      },
    ),

  importIcs: (icsContent: string) =>
    fetchApi<import('@lemail/shared-types').HolidaySyncResultDto>(
      '/admin/holidays/import-ics',
      {
        method: 'POST',
        body: JSON.stringify({ icsContent }),
      },
    ),

  create: (dto: import('@lemail/shared-types').CreateHolidayDto) =>
    fetchApi<import('@lemail/shared-types').SystemHolidayDto>('/admin/holidays', {
      method: 'POST',
      body: JSON.stringify(dto),
    }),

  update: (id: string, dto: import('@lemail/shared-types').UpdateHolidayDto) =>
    fetchApi<import('@lemail/shared-types').SystemHolidayDto>(
      `/admin/holidays/${id}`,
      {
        method: 'PATCH',
        body: JSON.stringify(dto),
      },
    ),

  delete: (id: string) =>
    fetchApi<{ deleted: boolean }>(`/admin/holidays/${id}`, {
      method: 'DELETE',
    }),
};



