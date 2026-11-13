'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';

export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated, isAdmin, isLoading, licenseStatus, isLicenseLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }

    if (isLicenseLoading) return;

    if (isAdmin) {
      if (licenseStatus && !licenseStatus.isValid) {
        router.replace('/admin/license');
      } else {
        router.replace('/admin/dashboard');
      }
    } else {
      router.replace('/mail/inbox');
    }
  }, [isAuthenticated, isAdmin, isLoading, isLicenseLoading, licenseStatus, router]);

  return null;
}
