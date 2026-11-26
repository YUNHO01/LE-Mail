'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';

export type ToastVariant = 'info' | 'error';

export interface ToastState {
  message: string;
  variant: ToastVariant;
}

/**
 * 비차단 상태 알림 토스트 훅
 */
export function useToast(durationMs = 2800) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissToast = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setToast(null);
  }, []);

  const showToast = useCallback(
    (message: string, variant: ToastVariant = 'info') => {
      setToast({ message, variant });
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setToast(null);
      }, durationMs);
    },
    [durationMs],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { toast, showToast, dismissToast };
}

/**
 * 화면 우하단 비차단 토스트 배너
 */
export const ToastBanner: React.FC<{ toast: ToastState | null }> = ({ toast }) => {
  if (!toast) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-5 right-5 z-50 rounded-xl px-4 py-2.5 text-xs font-medium text-white shadow-xl ${
        toast.variant === 'error' ? 'bg-[#ff3b30]' : 'bg-[#1d1d1f]'
      }`}
    >
      {toast.message}
    </div>
  );
};

/**
 * 바이트 단위를 읽기 쉬운 파일 크기 문자열로 변환
 */
export function formatFileSize(bytes: number | string): string {
  const num = typeof bytes === 'string' ? Number(bytes) : bytes;
  if (!Number.isFinite(num) || num < 0) return '0 B';
  if (num < 1024) return `${num} B`;
  const kb = num / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}
