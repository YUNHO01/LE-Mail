'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { formatBrandName, SystemLicenseInfo, UserDto, UserRole } from '@lemail/shared-types';

const CONSOLE_USER_STORAGE_KEY = 'lemail_console_user';

interface AuthContextType {
  user: UserDto | null;
  token: string | null;
  isLoading: boolean;
  licenseStatus: SystemLicenseInfo | null;
  isLicenseLoading: boolean;
  refreshLicenseStatus: (opts?: { role?: UserRole | string }) => Promise<SystemLicenseInfo | null>;
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
  isAuthenticated: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<UserDto | null>(null);
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
    [user?.role],
  );

  useEffect(() => {
    const brandName = formatBrandName(licenseStatus);
    if (typeof document !== 'undefined') {
      document.title = `${brandName} Admin Console`;
    }
  }, [licenseStatus]);

  useEffect(() => {
    // 기존 localStorage 토큰 잔여물 제거 (HttpOnly 쿠키 기반)
    localStorage.removeItem('lemail_token');
    const storedUser = localStorage.getItem(CONSOLE_USER_STORAGE_KEY);
    let parsedUser: UserDto | null = null;

    if (storedUser) {
      try {
        const candidate: UserDto = JSON.parse(storedUser);
        if (candidate?.role === UserRole.SYSTEM_ADMIN) {
          parsedUser = candidate;
          setUser(parsedUser);
        } else {
          localStorage.removeItem(CONSOLE_USER_STORAGE_KEY);
        }
      } catch {
        localStorage.removeItem(CONSOLE_USER_STORAGE_KEY);
      }
    }

    // HttpOnly 쿠키 세션 및 관리자 권한 검증
    fetch(`${API_BASE_URL}/api/auth/profile`, {
      credentials: 'include',
    })
      .then(async (res) => {
        if (res.status === 401) {
          localStorage.removeItem(CONSOLE_USER_STORAGE_KEY);
          setUser(null);
          await refreshLicenseStatus({ role: undefined });
          if (
            parsedUser &&
            typeof window !== 'undefined' &&
            !window.location.pathname.startsWith('/login')
          ) {
            router.replace('/login?reason=session_expired');
          }
          return;
        }

        if (!res.ok) {
          await refreshLicenseStatus({ role: parsedUser?.role });
          return;
        }

        const profile: UserDto = await res.json();
        if (profile?.role !== UserRole.SYSTEM_ADMIN) {
          // 동일 호스트 쿠키 공유 등으로 일반 사용자 세션이 감지된 경우 관리자 콘솔 접근 차단
          localStorage.removeItem(CONSOLE_USER_STORAGE_KEY);
          setUser(null);
          await refreshLicenseStatus({ role: undefined });
          if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
            router.replace('/login?reason=admin_only');
          }
          return;
        }

        setUser(profile);
        localStorage.setItem(CONSOLE_USER_STORAGE_KEY, JSON.stringify(profile));
        await refreshLicenseStatus({ role: profile.role });
      })
      .catch(async () => {
        await refreshLicenseStatus({ role: parsedUser?.role });
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

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
      const res = await fetch(`${API_BASE_URL}/api/auth/admin/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          success: false,
          message:
            data.message ||
            (res.status === 403
              ? '관리자 권한이 있는 계정만 로그인할 수 있습니다.'
              : '로그인에 실패했습니다.'),
        };
      }

      // 프론트엔드 이중 방어: SYSTEM_ADMIN 역할 확인
      if (data.user?.role !== UserRole.SYSTEM_ADMIN) {
        return {
          success: false,
          message: '관리자 권한이 있는 계정만 로그인할 수 있습니다.',
        };
      }

      setUser(data.user);
      localStorage.removeItem('lemail_token');
      localStorage.setItem(CONSOLE_USER_STORAGE_KEY, JSON.stringify(data.user));

      const licStatus = await refreshLicenseStatus({
        role: data.user.role,
      });

      return { success: true, user: data.user, licenseStatus: licStatus };
    } catch (err: any) {
      return { success: false, message: err.message || '서버 통신 오류가 발생했습니다.' };
    }
  };

  const logout = () => {
    fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {});
    setUser(null);
    localStorage.removeItem('lemail_token');
    localStorage.removeItem(CONSOLE_USER_STORAGE_KEY);
    router.push('/login');
  };

  const isAdmin = user?.role === UserRole.SYSTEM_ADMIN;

  return (
    <AuthContext.Provider
      value={{
        user,
        token: null,
        isLoading,
        licenseStatus,
        isLicenseLoading,
        refreshLicenseStatus,
        login,
        logout,
        isAuthenticated: !!user && isAdmin,
        isAdmin,
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
