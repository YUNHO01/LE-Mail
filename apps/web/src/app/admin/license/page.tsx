'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { PageHeader } from '@/components/common';
import { licenseApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { SystemLicenseInfo } from '@lemail/shared-types';
import {
  ShieldCheck,
  ShieldAlert,
  UploadCloud,
  FileCheck2,
  Building2,
  Users,
  Calendar,
  Clock,
  RotateCw,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Info,
  KeyRound,
  FileText,
  Database,
} from 'lucide-react';

export default function LicenseAdminPage() {
  const { refreshLicenseStatus } = useAuth();
  const [licenseInfo, setLicenseInfo] = useState<SystemLicenseInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchLicenseStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await licenseApi.getStatus();
      setLicenseInfo(data);
    } catch (err: any) {
      console.error('라이선스 정보 조회 실패:', err);
      setFeedback({
        type: 'error',
        message: err.message || '라이선스 상태 정보를 불러오지 못했습니다.',
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLicenseStatus();
  }, [fetchLicenseStatus]);

  // 라이선스 파일 등록 처리
  const processLicenseFile = async (file: File) => {
    if (!file.name.endsWith('.lic') && !file.name.endsWith('.json')) {
      setFeedback({
        type: 'error',
        message: '라이선스 파일(.lic 또는 .json)만 업로드할 수 있습니다.',
      });
      return;
    }

    setIsUploading(true);
    setFeedback(null);

    try {
      const text = await file.text();
      const updated = await licenseApi.register(text);
      setLicenseInfo(updated);
      setFeedback({
        type: 'success',
        message: 'LEMail 정품 라이선스가 성공적으로 등록 및 동기화되었습니다!',
      });
      await refreshLicenseStatus();
      fetchLicenseStatus();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || '라이선스 등록에 실패했습니다. 올바른 발급 파일인지 확인해 주세요.',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processLicenseFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processLicenseFile(e.target.files[0]);
    }
  };

  const usagePercent =
    licenseInfo?.maxUsers && licenseInfo.maxUsers > 0
      ? Math.min(100, Math.round(((licenseInfo.currentUsers || 0) / licenseInfo.maxUsers) * 100))
      : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="라이선스 관리"
        icon={<KeyRound className="w-6 h-6 text-indigo-500" />}
        subtitle="LEMail 엔터프라이즈 정품 라이선스 인증 상태, 파일-DB 무결성 및 사서함 허용 정원을 관리합니다."
      />

      {/* 상단 알림 배너 (피드백) */}
      {feedback && (
        <div
          className={`flex items-start gap-3 p-4 rounded-xl border transition-all ${
            feedback.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
              : 'bg-rose-950/50 border-rose-800 text-rose-300'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 mt-0.5 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 mt-0.5 text-rose-400 shrink-0" />
          )}
          <div className="flex-1 text-sm font-medium leading-relaxed">{feedback.message}</div>
          <button
            onClick={() => setFeedback(null)}
            className="text-xs opacity-70 hover:opacity-100 underline ml-2"
          >
            닫기
          </button>
        </div>
      )}

      {/* 파일-DB 무결성 불일치 경고 배너 */}
      {licenseInfo && !licenseInfo.isValid && (
        <div className="flex items-start gap-3 p-4 rounded-xl border bg-amber-950/40 border-amber-700/80 text-amber-200">
          <ShieldAlert className="w-5 h-5 mt-0.5 text-amber-400 shrink-0" />
          <div className="flex-1 text-sm leading-relaxed">
            <span className="font-semibold text-amber-300">라이선스 주의/제한: </span>
            {licenseInfo.message}
          </div>
          <button
            onClick={fetchLicenseStatus}
            className="flex items-center gap-1 px-2.5 py-1 text-xs bg-amber-900/60 hover:bg-amber-800 rounded border border-amber-700 text-amber-100 transition"
          >
            <RotateCw className="w-3 h-3" /> 재확인
          </button>
        </div>
      )}

      {/* 1. 라이선스 상태 대시보드 카드 */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 shadow-xl overflow-hidden backdrop-blur-sm">
        {/* 카드 헤더 */}
        <div className="flex flex-wrap items-center justify-between border-b border-slate-800/80 px-6 py-4 gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl ${
                licenseInfo?.isValid
                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                  : 'bg-rose-950 text-rose-400 border border-rose-800/60'
              }`}
            >
              {licenseInfo?.isValid ? (
                <ShieldCheck className="w-6 h-6" />
              ) : (
                <ShieldAlert className="w-6 h-6" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                LEMail 시스템 라이선스 현황
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800 font-semibold">
                  Product: LEMail
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                전자서명 무결성 및 서버 파일 ↔ DB 정보 일치 상태가 실시간 보호됩니다.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* 인증 배지 */}
            {isLoading ? (
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 animate-pulse">
                확인 중...
              </span>
            ) : licenseInfo?.isValid ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-300 border border-emerald-700">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                정품 인증 완료
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-950 text-rose-300 border border-rose-700">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                인증 필요 / 불일치
              </span>
            )}

            <button
              onClick={fetchLicenseStatus}
              disabled={isLoading}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              title="새로고침"
            >
              <RotateCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* 카드 본문 그리드 */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* 1. 발급 대상 기관 */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-400 mb-1">
              <Building2 className="w-4 h-4 text-indigo-400" /> 발급 기관 / 고객사
            </div>
            <div className="text-base font-bold text-white truncate">
              {licenseInfo?.organizationName || '미등록'}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              라이선스 ID: <code className="text-slate-400">{licenseInfo?.licenseId || '-'}</code>
            </div>
          </div>

          {/* 2. 사용자 정원 현황 */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <div className="flex items-center justify-between text-xs font-medium text-slate-400 mb-1">
              <span className="flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-400" /> 사서함/사용자 정원
              </span>
              <span className="text-slate-300 font-semibold">{usagePercent}%</span>
            </div>
            <div className="text-base font-bold text-white">
              <span className="text-indigo-400">{licenseInfo?.currentUsers ?? 0}</span>
              <span className="text-slate-400 text-sm font-normal">
                {' '}
                / {licenseInfo?.maxUsers ?? 0} 명
              </span>
            </div>
            {/* 프로그레스 바 */}
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mt-2">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  usagePercent > 90
                    ? 'bg-rose-500'
                    : usagePercent > 75
                      ? 'bg-amber-500'
                      : 'bg-indigo-500'
                }`}
                style={{ width: `${usagePercent}%` }}
              />
            </div>
          </div>

          {/* 3. 사용 기한 */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-400 mb-1">
              <Calendar className="w-4 h-4 text-indigo-400" /> 시스템 사용 기한
            </div>
            <div className="text-base font-bold text-white flex items-center gap-2">
              {licenseInfo?.isUnlimited ? (
                <span className="text-emerald-400 font-semibold">영구 라이선스 (무제한)</span>
              ) : licenseInfo?.expiresAt ? (
                <span>{licenseInfo.expiresAt.slice(0, 10)}</span>
              ) : (
                <span className="text-slate-500">-</span>
              )}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {licenseInfo?.isUnlimited ? (
                '만료 기한 없이 무제한 사용 가능'
              ) : licenseInfo?.daysRemaining !== undefined && licenseInfo?.daysRemaining !== null ? (
                <span className={licenseInfo.daysRemaining <= 14 ? 'text-amber-400 font-medium' : 'text-slate-400'}>
                  만료까지 {licenseInfo.daysRemaining}일 남음
                </span>
              ) : (
                '-'
              )}
            </div>
          </div>

          {/* 4. 파일 ↔ DB 무결성 상태 */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-400 mb-1">
              <Database className="w-4 h-4 text-indigo-400" /> 파일 ↔ DB 일치성
            </div>
            <div className="text-sm font-semibold flex items-center gap-2">
              {licenseInfo?.fileIntegrityMatched ? (
                <span className="text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" /> 완벽 일치 (정상)
                </span>
              ) : (
                <span className="text-rose-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" /> 불일치 (변조 위험)
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              서버 파일의 해시와 DB 등록 레코드가 동기화되어 있습니다.
            </div>
          </div>

          {/* 5. 암호화 알고리즘 */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-400 mb-1">
              <KeyRound className="w-4 h-4 text-indigo-400" /> 서명 알고리즘
            </div>
            <div className="text-sm font-bold text-white">
              RSA-2048 / SHA-256
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Canonical JSON 정렬 전자서명 체계
            </div>
          </div>

          {/* 6. 발급 및 등록 일시 */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-400 mb-1">
              <Clock className="w-4 h-4 text-indigo-400" /> 등록 일시
            </div>
            <div className="text-sm font-medium text-slate-300">
              {licenseInfo?.registeredAt ? licenseInfo.registeredAt.slice(0, 19).replace('T', ' ') : '-'}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              발급일: {licenseInfo?.issuedAt ? licenseInfo.issuedAt.slice(0, 10) : '-'}
            </div>
          </div>
        </div>
      </div>

      {/* 2. 신규 라이선스 등록 / 업로드 영역 */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 shadow-xl p-6">
        <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
          <UploadCloud className="w-5 h-5 text-indigo-400" />
          신규 라이선스 파일 등록 (.lic)
        </h3>
        <p className="text-xs text-slate-400 mb-5">
          발급받은 LEMail 전용 라이선스 파일(<code className="text-indigo-300">*.lic</code> 또는{' '}
          <code className="text-indigo-300">*.json</code>)을 아래 영역에 드래그하거나 선택하여 등록하세요.
        </p>

        {/* 숨김 파일 인풋 */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".lic,.json"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* 드래그 앤 드롭 박스 */}
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-200 ${
            dragActive
              ? 'border-indigo-500 bg-indigo-950/30 text-indigo-200'
              : 'border-slate-700/80 hover:border-slate-500 bg-slate-950/40 text-slate-400 hover:text-slate-300'
          }`}
        >
          <div className="p-3.5 rounded-full bg-indigo-950/80 border border-indigo-800/60 text-indigo-400 mb-3">
            {isUploading ? (
              <RotateCw className="w-8 h-8 animate-spin" />
            ) : (
              <FileCheck2 className="w-8 h-8" />
            )}
          </div>
          <div className="text-sm font-semibold text-white">
            {isUploading ? '라이선스 파일 검증 및 등록 중...' : '클릭하여 라이선스 파일 선택 또는 여기에 드래그'}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            지원 확장자: .lic, .json (최대 1MB)
          </p>
        </div>

        {/* 안내 사항 */}
        <div className="mt-5 p-4 rounded-xl bg-slate-950/50 border border-slate-800/80 text-xs text-slate-400 space-y-1.5">
          <div className="font-semibold text-slate-300 flex items-center gap-1.5">
            <Info className="w-4 h-4 text-indigo-400" /> 라이선스 등록 안내 사항:
          </div>
          <ul className="list-disc list-inside space-y-1 text-slate-400 pl-1">
            <li>
              <strong>제품 식별 검증:</strong> LEMail 전용으로 발급된 라이선스만 등록됩니다. 근태관리(AMS) 등 타 제품 라이선스 파일은 차단됩니다.
            </li>
            <li>
              <strong>파일-DB 무결성 방어:</strong> 등록 즉시 서버 내부 디스크에 안전하게 저장되며, 데이터베이스 레코드와 교차 대조되어 임의 변조 시 시스템이 보호 차단됩니다.
            </li>
            <li>
              <strong>등록 유효기간:</strong> 라이선스 발급 시 지정된 유효기간(기본 14일) 이내에 시스템에 등록해야 합니다.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
