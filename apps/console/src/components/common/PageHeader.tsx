'use client';

import React from 'react';

export interface PageHeaderProps {
  /** 페이지 메인 타이틀 (예: '받은편지함', '사용자 계정 관리') */
  title: string;
  /** 타이틀 좌측 아이콘 (선택 사항) */
  icon?: React.ReactNode;
  /** 타이틀 하단 설명 정보 (줄바꿈되어 타이틀 바로 아래에 배치) */
  subtitle?: React.ReactNode;
  /** 타이틀 우측 뱃지 (선택 사항) */
  badge?: React.ReactNode;
  /** 우측 상단 단일 액션 슬롯 (주요 CTA 버튼, 새로고침 등) */
  action?: React.ReactNode;
  /** 최상위 컨테이너 추가 클래스 */
  className?: string;
}

/**
 * 전사 화면 공통 표준 페이지 헤더 컴포넌트 (ams / Cruip Mosaic 기준)
 * 1. 메인 타이틀: text-2xl font-bold text-slate-900 tracking-tight
 * 2. 설명문(부제목): text-sm text-slate-500 mt-1 (타이틀 바로 아래 독립 줄로 배치)
 * 3. 단일 액션 슬롯: 우측 상단 flex items-center gap-2 shrink-0
 */
export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  icon,
  subtitle,
  badge,
  action,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${className}`}
    >
      <div>
        <div className="flex items-center gap-2 mb-1">
          {icon && <span className="shrink-0">{icon}</span>}
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            {title}
          </h1>
          {badge && <span className="shrink-0">{badge}</span>}
        </div>
        {subtitle && (
          <p className="text-sm text-slate-500">
            {subtitle}
          </p>
        )}
      </div>

      {action && (
        <div className="flex items-center gap-2 shrink-0">
          {action}
        </div>
      )}
    </div>
  );
};

export default PageHeader;
