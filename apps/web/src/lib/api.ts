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

