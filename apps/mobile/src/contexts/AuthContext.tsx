'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { formatBrandName, SystemLicenseInfo, UserDto, UserRole } from '@lemail/shared-types';
import { authenticateWithBiometric, BIOMETRIC_HINT_EMAIL_KEY } from '../lib/webauthn';

interface AuthResult {
  success: boolean;
  message?: string;
  user?: UserDto;
  licenseStatus?: SystemLicenseInfo | null;
}

interface AuthContextType {
  user: UserDto | null;
  token: string | null;
  isLoading: boolean;
  licenseStatus: SystemLicenseInfo | null;
  isLicenseLoading: boolean;
  refreshLicenseStatus: (opts?: { token?: string; role?: UserRole | string }) => Promise<SystemLicenseInfo | null>;
  login: (email: string, pass: string) => Promise<AuthResult>;
  loginWithBiometric: (email?: string) => Promise<AuthResult>;
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

  const refreshLicenseStatus = useCallback(
    async (opts?: { role?: UserRole | string }): Promise<SystemLicenseInfo | null> => {
      setIsLicenseLoading(true);
      try {
        const role = opts?.role ?? user?.role;
        const isAdminUser = role === UserRole.SYSTEM_ADMIN;

        if (isAdminUser) {
          const res = await fetch(`${API_BASE_URL}/api/admin/license/status`, {
            credentials: 'include',
          });
          if (res.ok) {
            const data: SystemLicenseInfo = await res.json();
            setLicenseStatus(data);
            return data;
          }
        }

        const res = await fetch(`${API_BASE_URL}/api/license/public`, {
          credentials: 'include',
        });
        if (res.ok) {
          const pub: { isValid: boolean; brandName?: string } = await res.json();
          const minimalStatus = {
            isValid: Boolean(pub.isValid),
            brandName: pub.brandName,
          } as unknown as SystemLicenseInfo;
          setLicenseStatus(minimalStatus);
          return minimalStatus;
        }
        return null;
      } catch {
        return null;
      } finally {
        setIsLicenseLoading(false);
      }
    },
    [token, user?.role],
  );

  useEffect(() => {
    const brandName = formatBrandName(licenseStatus);
    if (typeof document !== 'undefined') {
      document.title = brandName;
      const appleTitleMeta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
      if (appleTitleMeta) {
        appleTitleMeta.setAttribute('content', brandName);
      }
    }
  }, [licenseStatus]);

  useEffect(() => {
    localStorage.removeItem('lemail_token');
    const storedUser = localStorage.getItem('lemail_user');
    let parsedUser: UserDto | null = null;

    if (storedUser) {
      try {
        parsedUser = JSON.parse(storedUser);
        setUser(parsedUser);
      } catch {
        localStorage.removeItem('lemail_user');
      }
    }
    setIsLoading(false);

    // 모바일은 관리자 콘솔을 지원하지 않으므로 라이선스 미등록/만료 시 관리자 포함 모든 사용자 접근 제한
    refreshLicenseStatus({ role: parsedUser?.role }).then((licStatus) => {
      if (parsedUser && licStatus && !licStatus.isValid) {
        localStorage.removeItem('lemail_user');
        setUser(null);
        setToken(null);
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
          router.replace('/login?reason=license_required');
        }
      }
    });

    fetch(`${API_BASE_URL}/api/auth/profile`, {
      credentials: 'include',
    })
      .then((res) => {
        if (res.status === 401) {
          localStorage.removeItem('lemail_user');
          setUser(null);
          setToken(null);
          if (
            parsedUser &&
            typeof window !== 'undefined' &&
            !window.location.pathname.startsWith('/login')
          ) {
            router.replace('/login?reason=session_expired');
          }
          return null;
        }
        return res.ok ? res.json() : null;
      })
      .then((profile) => {
        if (profile) {
          fetch(`${API_BASE_URL}/api/users/me/storage-usage`, {
            credentials: 'include',
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
  }, [refreshLicenseStatus, router]);

  const refreshStorageUsage = async () => {
    if (!user) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/users/me/storage-usage`, {
        credentials: 'include',
      });
      if (res.status === 401) {
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

  const completeLogin = async (data: { accessToken: string; user: UserDto }): Promise<AuthResult> => {
    const licStatus = await refreshLicenseStatus({
      role: data.user?.role,
    });
    if (licStatus && !licStatus.isValid) {
      return {
        success: false,
        message: '유효한 시스템 라이선스가 없습니다. 내부 관리자 콘솔에서 라이선스를 등록해 주세요.',
        licenseStatus: licStatus,
      };
    }

    setToken(null);
    setUser(data.user);
    localStorage.removeItem('lemail_token');
    localStorage.setItem('lemail_user', JSON.stringify(data.user));

    fetch(`${API_BASE_URL}/api/users/me/storage-usage`, {
      credentials: 'include',
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
  };

  const login = async (email: string, pass: string): Promise<AuthResult> => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, message: data.message || '로그인에 실패했습니다.' };
      }

      return completeLogin(data);
    } catch (err: any) {
      return { success: false, message: err.message || '서버 통신 오류가 발생했습니다.' };
    }
  };

  const loginWithBiometric = async (email?: string): Promise<AuthResult> => {
    try {
      const data = await authenticateWithBiometric(email);
      if (data.user?.email && typeof window !== 'undefined') {
        localStorage.setItem(BIOMETRIC_HINT_EMAIL_KEY, data.user.email);
      }
      return completeLogin(data);
    } catch (err: any) {
      return { success: false, message: err.message || '생체인식 로그인에 실패했습니다.' };
    }
  };

  const logout = () => {
    fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {});
    setUser(null);
    setToken(null);
    localStorage.removeItem('lemail_token');
    localStorage.removeItem('lemail_user');
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.controller?.postMessage({ type: 'CLEAR_CACHE' });
    }
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
        loginWithBiometric,
        logout,
        refreshStorageUsage,
        isAuthenticated: !!user,
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
