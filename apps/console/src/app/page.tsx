'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';

export default function ConsoleHomePage() {
  const router = useRouter();
  const { isAuthenticated, isAdmin, isLoading, licenseStatus, isLicenseLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated || !isAdmin) {
      router.replace('/login');
      return;
    }

    if (isLicenseLoading) return;

    if (licenseStatus && !licenseStatus.isValid) {
      router.replace('/license');
    } else {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, isAdmin, isLoading, isLicenseLoading, licenseStatus, router]);

  return null;
}
