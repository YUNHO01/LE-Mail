import type {
  DepartmentDto,
  EmploymentStatus,
  OrgSyncStatus,
  OrgSyncType,
} from '@lemail/shared-types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';
const CONSOLE_USER_STORAGE_KEY = 'lemail_console_user';

export async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}/api${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      ...headers,
      ...options?.headers,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('lemail_token');
        localStorage.removeItem(CONSOLE_USER_STORAGE_KEY);
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

export interface DepartmentTreeNodeDto extends DepartmentDto {
  userCount: number;
  children: DepartmentTreeNodeDto[];
}

export interface OrgSyncLogDto {
  id: string;
  syncType: OrgSyncType;
  status: OrgSyncStatus;
  totalCount: number;
  createdCount: number;
  updatedCount: number;
  deactivatedCount: number;
  skippedCount: number;
  errorSummary: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export const orgApi = {
  getDepartments: (includeInactive = false) =>
    fetchApi<DepartmentDto[]>(
      `/org/departments${includeInactive ? '?includeInactive=true' : ''}`,
    ),

  getDepartmentTree: (includeInactive = false) =>
    fetchApi<DepartmentTreeNodeDto[]>(
      `/org/departments/tree${includeInactive ? '?includeInactive=true' : ''}`,
    ),

  createDepartment: (dto: {
    name: string;
    code?: string | null;
    parentId?: string | null;
    sortOrder?: number;
    managerEmployeeId?: string | null;
    isActive?: boolean;
  }) =>
    fetchApi<DepartmentDto>('/org/departments', {
      method: 'POST',
      body: JSON.stringify(dto),
    }),

  updateDepartment: (
    id: string,
    dto: {
      name?: string;
      code?: string | null;
      parentId?: string | null;
      sortOrder?: number;
      managerEmployeeId?: string | null;
      isActive?: boolean;
    },
  ) =>
    fetchApi<DepartmentDto>(`/org/departments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    }),

  deleteDepartment: (id: string) =>
    fetchApi<{ success: boolean; message: string }>(`/org/departments/${id}`, {
      method: 'DELETE',
    }),

  syncAms: (payload: {
    syncType?: OrgSyncType;
    autoProvisionMailbox?: boolean;
    sendWelcomeMail?: boolean;
    departments?: Array<{
      amsDeptId: string;
      code?: string | null;
      parentAmsDeptId?: string | null;
      name: string;
      sortOrder?: number;
      managerEmployeeId?: string | null;
      isActive?: boolean;
    }>;
    employees?: Array<{
      employeeNumber: string;
      amsUserId?: string | null;
      name: string;
      email?: string | null;
      amsDeptId?: string | null;
      departmentCode?: string | null;
      position?: string | null;
      jobTitle?: string | null;
      phone?: string | null;
      mobile?: string | null;
      employmentStatus?: EmploymentStatus;
      mailEnabled?: boolean;
    }>;
  }) =>
    fetchApi<OrgSyncLogDto>('/org/sync/ams', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getSyncLogs: (limit = 20) =>
    fetchApi<OrgSyncLogDto[]>(`/org/sync/logs?limit=${limit}`),

  getSyncSettings: () =>
    fetchApi<{
      enabled: boolean;
      apiUrl: string;
      departmentsApiUrl: string;
      usersApiUrl: string;
      hasApiToken: boolean;
      intervalMinutes: number;
      autoProvisionMailbox: boolean;
      sendWelcomeMail: boolean;
    }>('/org/sync/settings'),

  updateSyncSettings: (dto: {
    enabled?: boolean;
    apiUrl?: string;
    departmentsApiUrl?: string;
    usersApiUrl?: string;
    apiToken?: string;
    intervalMinutes?: number;
    autoProvisionMailbox?: boolean;
    sendWelcomeMail?: boolean;
  }) =>
    fetchApi<{
      enabled: boolean;
      apiUrl: string;
      departmentsApiUrl: string;
      usersApiUrl: string;
      hasApiToken: boolean;
      intervalMinutes: number;
      autoProvisionMailbox: boolean;
      sendWelcomeMail: boolean;
    }>('/org/sync/settings', {
      method: 'PATCH',
      body: JSON.stringify(dto),
    }),

  pullAms: () =>
    fetchApi<OrgSyncLogDto>('/org/sync/pull', {
      method: 'POST',
    }),
};
