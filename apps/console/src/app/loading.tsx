'use client';

import React from 'react';

/**
 * Next.js 표준 라우트 전환 로딩 UI 컴포넌트
 * 좌측 메뉴 클릭 또는 라우트 이동 시 우측 메인 영역에 즉각 표출되는 스켈레톤 및 스피너 로딩 화면
 */
export default function Loading() {
  return (
    <div className="w-full space-y-6 animate-pulse">
      {/* 상단 페이지 헤더 영역 스켈레톤 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-gray-100 dark:border-slate-800">
        <div className="space-y-2">
          <div className="h-7 w-48 bg-gray-200 dark:bg-slate-800 rounded-md" />
          <div className="h-4 w-72 bg-gray-100 dark:bg-slate-800/60 rounded" />
        </div>
        <div className="h-9 w-28 bg-gray-200 dark:bg-slate-800 rounded-lg self-start sm:self-auto" />
      </div>

      {/* 메인 컨텐츠 영역: 부드러운 스피너 & 스켈레톤 카드 */}
      <div className="bg-white dark:bg-slate-850 rounded-xl border border-gray-200/80 dark:border-slate-800 shadow-sm p-6 sm:p-8 min-h-[420px] flex flex-col items-center justify-center relative overflow-hidden">
        {/* 잔잔한 배경 장식/스켈레톤 라인 */}
        <div className="w-full space-y-4 mb-8 max-w-2xl opacity-40">
          <div className="h-4 bg-gray-200 dark:bg-slate-800 rounded w-full" />
          <div className="h-4 bg-gray-200 dark:bg-slate-800 rounded w-5/6" />
          <div className="h-4 bg-gray-200 dark:bg-slate-800 rounded w-4/6" />
        </div>

        {/* 중앙 로딩 스피너 & 안내 문구 */}
        <div className="flex flex-col items-center gap-3.5 z-10">
          <div className="relative flex items-center justify-center">
            {/* 배경 링 */}
            <div className="w-10 h-10 rounded-full border-[3px] border-sky-100 dark:border-sky-950/60" />
            {/* 회전 스피너 */}
            <div className="absolute inset-0 w-10 h-10 rounded-full border-[3px] border-sky-600 dark:border-sky-400 border-t-transparent animate-spin" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              화면을 불러오는 중입니다...
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              데이터를 준비하고 있습니다. 잠시만 기다려 주세요.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
