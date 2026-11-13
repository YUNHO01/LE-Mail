'use client';

import React from 'react';

export interface PageHeaderProps {
  title: string;
  icon?: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

/**
 * 모바일 환경에서는 MobileHeader가 상단 타이틀을 담당하므로
 * PageHeader는 우측 액션 버튼이 있을 때만 컴팩트하게 표시합니다.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({
  action,
  className = '',
}) => {
  if (!action) return null;

  return (
    <div className={`flex items-center justify-end gap-2 px-3 pt-1 pb-2 ${className}`}>
      {action}
    </div>
  );
};
