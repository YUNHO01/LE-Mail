'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { UserDto } from '@lemail/shared-types';

interface AuthContextType {
  user: UserDto | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, pass: string) => Promise<{ success: boolean; message?: string; user?: UserDto }>;
  logout: () => void;
  refreshStorageUsage: () => Promise<void>;
  isAuthenticated: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:9200';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<UserDto | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Load persisted token
    const storedToken = localStorage.getItem('lemail_token');
    const storedUser = localStorage.getItem('lemail_user');

    if (storedToken && storedUser) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      } catch (e) {
        localStorage.removeItem('lemail_token');
        localStorage.removeItem('lemail_user');
      }
    }
    setIsLoading(false);

    if (storedToken) {
      // Background fresh token verification & profile fetch
      fetch(`${API_BASE_URL}/api/auth/profile`, {
        headers: { Authorization: `Bearer ${storedToken}` },
      })
        .then((res) => {
          if (res.status === 401) {
            // 토큰 만료 또는 세션 무효화
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
            // Fresh fetch of storage usage
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
  }, []);

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

  const login = async (email: string, pass: string): Promise<{ success: boolean; message?: string; user?: UserDto }> => {
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

      setToken(data.accessToken);
      setUser(data.user);
      localStorage.setItem('lemail_token', data.accessToken);
      localStorage.setItem('lemail_user', JSON.stringify(data.user));

      // Fetch storage stats right after login
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

      return { success: true, user: data.user };
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
        login,
        logout,
        refreshStorageUsage,
        isAuthenticated: !!token && !!user,
        isAdmin: user?.role === 'SYSTEM_ADMIN',
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
