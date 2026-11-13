'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';

export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }

    // 관리자 계정을 포함한 모든 사용자는 사용자 웹메일(/mail/inbox)로 진입
    router.replace('/mail/inbox');
  }, [isAuthenticated, isLoading, router]);

  return null;
}
