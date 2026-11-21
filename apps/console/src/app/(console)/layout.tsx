'use client';

import React, { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function ConsoleGuardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isAdmin, isLoading, licenseStatus, isLicenseLoading } = useAuth();

  // 1. 미인증 또는 관리자 권한이 없는 경우 즉시 로그인 페이지로 이동
  useEffect(() => {
    if (!isLoading && (!isAuthenticated || !isAdmin)) {
      router.replace('/login?reason=admin_only');
    }
  }, [isLoading, isAuthenticated, isAdmin, router]);

  // 2. 라이선스가 유효하지 않은 경우 라이선스 관리 화면으로 이동
  useEffect(() => {
    if (
      !isLoading &&
      isAuthenticated &&
      isAdmin &&
      !isLicenseLoading &&
      licenseStatus &&
      !licenseStatus.isValid &&
      pathname !== '/license'
    ) {
      router.replace('/license');
    }
  }, [isLoading, isAuthenticated, isAdmin, isLicenseLoading, licenseStatus, pathname, router]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-400">
        관리자 권한을 확인하는 중...
      </div>
    );
  }

  if (!isAuthenticated || !isAdmin) {
    return null;
  }

  if (
    !isLicenseLoading &&
    licenseStatus &&
    !licenseStatus.isValid &&
    pathname !== '/license'
  ) {
    return null;
  }

  return <>{children}</>;
}
