'use client';

import React, { useState } from 'react';
import { fetchApi } from '@/lib/api';
import {
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
  Info,
} from 'lucide-react';

export const PasswordChangeTab: React.FC = () => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 비밀번호 보안 강도 계산
  const calculateStrength = (pass: string) => {
    if (!pass) return { score: 0, label: '', color: 'bg-slate-200' };
    let score = 0;
    if (pass.length >= 6) score += 1;
    if (pass.length >= 8) score += 1;
    if (/[A-Za-z]/.test(pass) && /[0-9]/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass)) score += 1;

    if (score <= 1) return { score: 1, label: '위험 (취약)', color: 'bg-rose-500' };
    if (score <= 2) return { score: 2, label: '보통', color: 'bg-amber-500' };
    if (score === 3) return { score: 3, label: '적정', color: 'bg-sky-500' };
    return { score: 4, label: '매우 안전', color: 'bg-emerald-500' };
  };

  const strength = calculateStrength(newPassword);
  const isMatch = newPassword && confirmPassword && newPassword === confirmPassword;
  const isMismatch = confirmPassword && newPassword !== confirmPassword;
  const isSameAsCurrent = currentPassword && newPassword && currentPassword === newPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!currentPassword) {
      setMessage({ type: 'error', text: '현재 비밀번호를 입력해 주세요.' });
      return;
    }

    if (!newPassword) {
      setMessage({ type: 'error', text: '새 비밀번호를 입력해 주세요.' });
      return;
    }

    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: '새 비밀번호는 최소 6자 이상이어야 합니다.' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: '새 비밀번호와 비밀번호 확인이 일치하지 않습니다.' });
      return;
    }

    if (currentPassword === newPassword) {
      setMessage({ type: 'error', text: '새 비밀번호는 현재 비밀번호와 다르게 입력해 주세요.' });
      return;
    }

    try {
      setSaving(true);
      const res = await fetchApi<{ success: boolean; message: string }>('/users/me/password', {
        method: 'PUT',
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      setMessage({
        type: 'success',
        text: res?.message || '비밀번호가 성공적으로 변경되었습니다.',
      });

      // 입력 폼 초기화
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err.message || '비밀번호 변경 중 오류가 발생했습니다.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 w-full max-w-3xl">
      <div>
        <h2 className="text-base font-bold tracking-tight text-slate-900">사용자 비밀번호 변경</h2>
        <p className="text-xs text-slate-500 mt-1">
          현재 로그인된 계정의 로그인 비밀번호를 새롭게 변경하고 보안을 강화합니다.
        </p>
      </div>

      {/* 보안 권장 안내 배너 */}
      <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4 flex items-start gap-3 text-xs text-sky-900">
        <Info className="h-4 w-4 text-sky-600 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-semibold">안전한 비밀번호 관리 수칙</div>
          <p className="text-sky-800 leading-relaxed">
            영문 대/소문자, 숫자, 특수문자를 혼합한 8자리 이상의 비밀번호를 권장합니다. 타 사이트와 동일한
            비밀번호를 재사용하지 마시고, 정기적인 변경을 통해 사서함과 개인정보를 안전하게 보호하세요.
          </p>
        </div>
      </div>

      {/* 상태 메시지 배너 */}
      {message && (
        <div
          className={`rounded-2xl p-4 flex items-center gap-3 text-xs border ${
            message.type === 'success'
              ? 'bg-emerald-50/80 border-emerald-200 text-emerald-800'
              : 'bg-rose-50/80 border-rose-200 text-rose-800'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 text-rose-600 flex-shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* 비밀번호 변경 폼 카드 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* 현재 비밀번호 */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">
              현재 비밀번호 <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Lock className="h-4 w-4" />
              </div>
              <input
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="현재 사용 중인 비밀번호를 입력하세요"
                autoComplete="current-password"
                required
                className="h-10 w-full pl-9 pr-10 rounded-xl border border-slate-300 text-xs outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 bg-white text-slate-800 transition"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                tabIndex={-1}
              >
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="border-t border-slate-100 my-4" />

          {/* 새 비밀번호 */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">
              새 비밀번호 <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <KeyRound className="h-4 w-4" />
              </div>
              <input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="새로운 비밀번호 (최소 6자 이상)"
                autoComplete="new-password"
                required
                className="h-10 w-full pl-9 pr-10 rounded-xl border border-slate-300 text-xs outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 bg-white text-slate-800 transition"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                tabIndex={-1}
              >
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {/* 비밀번호 보안 강도 인디케이터 */}
            {newPassword && (
              <div className="pt-1.5 space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">비밀번호 보안 강도</span>
                  <span className="font-semibold text-slate-700">{strength.label}</span>
                </div>
                <div className="grid grid-cols-4 gap-1 h-1.5">
                  <div
                    className={`rounded-full transition-colors ${
                      strength.score >= 1 ? strength.color : 'bg-slate-200'
                    }`}
                  />
                  <div
                    className={`rounded-full transition-colors ${
                      strength.score >= 2 ? strength.color : 'bg-slate-200'
                    }`}
                  />
                  <div
                    className={`rounded-full transition-colors ${
                      strength.score >= 3 ? strength.color : 'bg-slate-200'
                    }`}
                  />
                  <div
                    className={`rounded-full transition-colors ${
                      strength.score >= 4 ? strength.color : 'bg-slate-200'
                    }`}
                  />
                </div>
              </div>
            )}

            {isSameAsCurrent && (
              <p className="text-[11px] text-amber-600 flex items-center gap-1 mt-1">
                <AlertCircle className="h-3 w-3" />
                <span>현재 비밀번호와 동일합니다. 다른 비밀번호를 입력해 주세요.</span>
              </p>
            )}
          </div>

          {/* 새 비밀번호 확인 */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">
              새 비밀번호 확인 <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="새로운 비밀번호를 한 번 더 입력하세요"
                autoComplete="new-password"
                required
                className={`h-10 w-full pl-9 pr-10 rounded-xl border text-xs outline-none bg-white text-slate-800 transition ${
                  isMismatch
                    ? 'border-rose-400 focus:border-rose-500 focus:ring-1 focus:ring-rose-500'
                    : isMatch
                      ? 'border-emerald-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500'
                      : 'border-slate-300 focus:border-sky-500 focus:ring-1 focus:ring-sky-500'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                tabIndex={-1}
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {isMatch && (
              <p className="text-[11px] text-emerald-600 flex items-center gap-1 mt-1">
                <CheckCircle2 className="h-3 w-3" />
                <span>비밀번호가 일치합니다.</span>
              </p>
            )}
            {isMismatch && (
              <p className="text-[11px] text-rose-500 flex items-center gap-1 mt-1">
                <AlertCircle className="h-3 w-3" />
                <span>새 비밀번호와 일치하지 않습니다.</span>
              </p>
            )}
          </div>

          {/* 버튼 영역 */}
          <div className="pt-2 flex items-center justify-end">
            <button
              type="submit"
              disabled={
                saving ||
                !currentPassword ||
                !newPassword ||
                !confirmPassword ||
                Boolean(isMismatch) ||
                Boolean(isSameAsCurrent) ||
                newPassword.length < 6
              }
              className="h-10 px-6 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-sm transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>비밀번호 변경 중...</span>
                </>
              ) : (
                <>
                  <KeyRound className="h-3.5 w-3.5" />
                  <span>비밀번호 변경 완료</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
