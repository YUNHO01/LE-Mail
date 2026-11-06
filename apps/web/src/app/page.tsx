'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';

export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated, isAdmin, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      router.replace('/login');
    } else if (isAdmin) {
      router.replace('/admin/dashboard');
    } else {
      router.replace('/mail/inbox');
    }
  }, [isAuthenticated, isAdmin, isLoading, router]);

  return null;
}
