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


