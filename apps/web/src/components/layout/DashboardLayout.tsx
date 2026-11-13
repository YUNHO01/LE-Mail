'use client';

import React, { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useNavigation } from '../../contexts/NavigationContext';
import { useAuth } from '../../contexts/AuthContext';

export const DashboardLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const pathname = usePathname();
    const router = useRouter();
    const { isNavigating } = useNavigation();
    const { isAuthenticated, isLoading } = useAuth();

    // /login 경로가 아닐 때 세션 또는 미인증 상태 감지 시 로그인 페이지로 즉시 이동
    useEffect(() => {
        if (!isLoading && !isAuthenticated && pathname !== '/login') {
            router.replace('/login');
        }
    }, [isLoading, isAuthenticated, pathname, router]);

    // /login 경로에서는 로그인 페이지 전체화면 렌더링
    if (pathname === '/login') {
        return <>{children}</>;
    }

    // 미인증 상태이거나 세션 확인 중일 때는 대시보드 화면 노출 방지
    if (isLoading || !isAuthenticated) {
        return null;
    }

    const isAdminRoute = pathname?.startsWith('/admin');

    return (
        <div className="flex h-screen overflow-hidden bg-slate-50 font-inter relative">
            <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

            <div className="relative flex flex-1 flex-col h-full overflow-hidden min-w-0">
                <Header sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

                {/* 상단 씬(Slim) 로딩 프로그레스 인디케이터 (페이지 전환 중일 때 즉각 표시) */}
                {isNavigating && (
                    <div className="absolute top-16 left-0 right-0 h-1 bg-sky-100/60 z-50 overflow-hidden shadow-sm">
                        <div
                            className={`h-full animate-pulse w-full origin-left transition-all ${
                                isAdminRoute ? 'bg-indigo-600' : 'bg-sky-600'
                            }`}
                        />
                    </div>
                )}

                <main className="flex-1 relative overflow-y-auto overflow-x-hidden min-h-0">
                    {/* 전환 중일 때 상단 전체를 덮는 0ms 즉각 오버레이 (배경 블러 + 스피너 + 스켈레톤 안내) */}
                    {isNavigating && (
                        <div className="absolute inset-0 bg-slate-50/90 backdrop-blur-xs z-40 transition-all duration-150">
                            <div className="px-4 sm:px-6 lg:px-8 py-8 w-full">
                                <div className="w-full space-y-6 animate-pulse">
                                    {/* 상단 페이지 헤더 영역 스켈레톤 */}
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-gray-100">
                                        <div className="space-y-2">
                                            <div className="h-7 w-48 bg-gray-200 rounded-md" />
                                            <div className="h-4 w-72 bg-gray-100 rounded" />
                                        </div>
                                        <div className="h-9 w-28 bg-gray-200 rounded-lg self-start sm:self-auto" />
                                    </div>

                                    {/* 메인 컨텐츠 영역: 스피너 & 스켈레톤 카드 */}
                                    <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-6 sm:p-8 min-h-[420px] flex flex-col items-center justify-center relative overflow-hidden">
                                        <div className="w-full space-y-4 mb-8 max-w-2xl opacity-40">
                                            <div className="h-4 bg-gray-200 rounded w-full" />
                                            <div className="h-4 bg-gray-200 rounded w-5/6" />
                                            <div className="h-4 bg-gray-200 rounded w-4/6" />
                                        </div>

                                        <div className="flex flex-col items-center gap-3.5 z-10">
                                            <div className="relative flex items-center justify-center">
                                                <div
                                                    className={`w-10 h-10 rounded-full border-[3px] ${
                                                        isAdminRoute ? 'border-indigo-100' : 'border-sky-100'
                                                    }`}
                                                />
                                                <div
                                                    className={`absolute inset-0 w-10 h-10 rounded-full border-[3px] border-t-transparent animate-spin ${
                                                        isAdminRoute ? 'border-indigo-600' : 'border-sky-600'
                                                    }`}
                                                />
                                            </div>
                                            <div className="text-center space-y-1">
                                                <p className="text-sm font-semibold text-gray-700">
                                                    화면을 불러오는 중입니다...
                                                </p>
                                                <p className="text-xs text-gray-400">
                                                    데이터를 준비하고 있습니다. 잠시만 기다려 주세요.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 기존 컨텐츠는 언마운트하지 않고 DOM 유지 -> 리렌더링 버벅임 방지 */}
                    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full">
                        <div className="w-full space-y-6">{children}</div>
                    </div>
                </main>
            </div>
        </div>
    );
};
