'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { SystemLicenseInfo, UserDto } from '@lemail/shared-types';

interface AuthContextType {
  user: UserDto | null;
  token: string | null;
  isLoading: boolean;
  licenseStatus: SystemLicenseInfo | null;
  isLicenseLoading: boolean;
  refreshLicenseStatus: () => Promise<SystemLicenseInfo | null>;
  login: (
    email: string,
    pass: string,
  ) => Promise<{
    success: boolean;
    message?: string;
    user?: UserDto;
    licenseStatus?: SystemLicenseInfo | null;
  }>;
  logout: () => void;
  refreshStorageUsage: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<UserDto | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [licenseStatus, setLicenseStatus] = useState<SystemLicenseInfo | null>(null);
  const [isLicenseLoading, setIsLicenseLoading] = useState(true);

  const refreshLicenseStatus = useCallback(async (): Promise<SystemLicenseInfo | null> => {
    setIsLicenseLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/license/status`);
      if (res.ok) {
        const data: SystemLicenseInfo = await res.json();
        setLicenseStatus(data);
        return data;
      }
      return null;
    } catch {
      return null;
    } finally {
      setIsLicenseLoading(false);
    }
  }, []);

  useEffect(() => {
    const storedToken = localStorage.getItem('lemail_token');
    const storedUser = localStorage.getItem('lemail_user');
    let parsedUser: UserDto | null = null;

    if (storedToken && storedUser) {
      try {
        parsedUser = JSON.parse(storedUser);
        setToken(storedToken);
        setUser(parsedUser);
      } catch {
        localStorage.removeItem('lemail_token');
        localStorage.removeItem('lemail_user');
      }
    }
    setIsLoading(false);

    // 모바일은 관리자 콘솔을 지원하지 않으므로 라이선스 미등록/만료 시 관리자 포함 모든 사용자 접근 제한
    refreshLicenseStatus().then((licStatus) => {
      if (storedToken && parsedUser && licStatus && !licStatus.isValid) {
        localStorage.removeItem('lemail_token');
        localStorage.removeItem('lemail_user');
        setUser(null);
        setToken(null);
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
          router.replace('/login?reason=license_required');
        }
      }
    });

    if (storedToken) {
      fetch(`${API_BASE_URL}/api/auth/profile`, {
        headers: { Authorization: `Bearer ${storedToken}` },
      })
        .then((res) => {
          if (res.status === 401) {
            localStorage.removeItem('lemail_token');
            localStorage.removeItem('lemail_user');
            setUser(null);
            setToken(null);
            if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
              router.replace('/login?reason=session_expired');
            }
            return null;
          }
          return res.ok ? res.json() : null;
        })
        .then((profile) => {
          if (profile) {
            fetch(`${API_BASE_URL}/api/users/me/storage-usage`, {
              headers: { Authorization: `Bearer ${storedToken}` },
            })
              .then((res) => (res.ok ? res.json() : null))
              .then((usage) => {
                if (usage) {
                  setUser((prev) => {
                    if (!prev) return null;
                    const updated: UserDto = {
                      ...prev,
                      mailboxQuotaMb: usage.quotaMb ?? prev.mailboxQuotaMb,
                      usedBytes: usage.usedBytes ?? 0,
                      usedMb: usage.usedMb ?? 0,
                      usagePercent: usage.usagePercent ?? 0,
                      messageCount: usage.messageCount ?? 0,
                    };
                    localStorage.setItem('lemail_user', JSON.stringify(updated));
                    return updated;
                  });
                }
              })
              .catch(() => {});
          }
        })
        .catch(() => {});
    }
  }, [refreshLicenseStatus, router]);

  const refreshStorageUsage = async () => {
    const currentToken = token || (typeof window !== 'undefined' ? localStorage.getItem('lemail_token') : null);
    if (!currentToken) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/users/me/storage-usage`, {
        headers: { Authorization: `Bearer ${currentToken}` },
      });
      if (res.status === 401) {
        localStorage.removeItem('lemail_token');
        localStorage.removeItem('lemail_user');
        setUser(null);
        setToken(null);
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
          router.replace('/login?reason=session_expired');
        }
        return;
      }
      if (res.ok) {
        const usage = await res.json();
        setUser((prev) => {
          if (!prev) return null;
          const updated: UserDto = {
            ...prev,
            mailboxQuotaMb: usage.quotaMb ?? prev.mailboxQuotaMb,
            usedBytes: usage.usedBytes ?? 0,
            usedMb: usage.usedMb ?? 0,
            usagePercent: usage.usagePercent ?? 0,
            messageCount: usage.messageCount ?? 0,
          };
          if (typeof window !== 'undefined') {
            localStorage.setItem('lemail_user', JSON.stringify(updated));
          }
          return updated;
        });
      }
    } catch {}
  };

  const login = async (
    email: string,
    pass: string,
  ): Promise<{
    success: boolean;
    message?: string;
    user?: UserDto;
    licenseStatus?: SystemLicenseInfo | null;
  }> => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, message: data.message || '로그인에 실패했습니다.' };
      }

      const licStatus = await refreshLicenseStatus();
      if (licStatus && !licStatus.isValid) {
        return {
          success: false,
          message: '유효한 시스템 라이선스가 없습니다. 내부 관리자 콘솔에서 라이선스를 등록해 주세요.',
          licenseStatus: licStatus,
        };
      }

      setToken(data.accessToken);
      setUser(data.user);
      localStorage.setItem('lemail_token', data.accessToken);
      localStorage.setItem('lemail_user', JSON.stringify(data.user));

      fetch(`${API_BASE_URL}/api/users/me/storage-usage`, {
        headers: { Authorization: `Bearer ${data.accessToken}` },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((usage) => {
          if (usage) {
            setUser((prev) => {
              if (!prev) return null;
              const updated: UserDto = {
                ...prev,
                mailboxQuotaMb: usage.quotaMb ?? prev.mailboxQuotaMb,
                usedBytes: usage.usedBytes ?? 0,
                usedMb: usage.usedMb ?? 0,
                usagePercent: usage.usagePercent ?? 0,
                messageCount: usage.messageCount ?? 0,
              };
              localStorage.setItem('lemail_user', JSON.stringify(updated));
              return updated;
            });
          }
        })
        .catch(() => {});

      return { success: true, user: data.user, licenseStatus: licStatus };
    } catch (err: any) {
      return { success: false, message: err.message || '서버 통신 오류가 발생했습니다.' };
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('lemail_token');
    localStorage.removeItem('lemail_user');
    router.push('/login');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        licenseStatus,
        isLicenseLoading,
        refreshLicenseStatus,
        login,
        logout,
        refreshStorageUsage,
        isAuthenticated: !!token && !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
