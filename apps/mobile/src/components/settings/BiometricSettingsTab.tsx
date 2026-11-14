'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Fingerprint, Plus, Trash2, AlertCircle, CheckCircle2, Smartphone } from 'lucide-react';
import { PasskeyCredentialDto } from '@lemail/shared-types';
import { useAuth } from '@/contexts/AuthContext';
import {
  BIOMETRIC_HINT_EMAIL_KEY,
  deleteBiometricCredential,
  getDefaultDeviceName,
  isBiometricSupported,
  listBiometricCredentials,
  registerBiometricCredential,
} from '@/lib/webauthn';

export function BiometricSettingsTab() {
  const { user } = useAuth();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [credentials, setCredentials] = useState<PasskeyCredentialDto[]>([]);
  const [deviceName, setDeviceName] = useState('');
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadCredentials = useCallback(async () => {
    try {
      const list = await listBiometricCredentials();
      setCredentials(list);
    } catch (err: any) {
      setError(err?.message || '등록된 생체인식 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setDeviceName(getDefaultDeviceName());
    isBiometricSupported().then((ok) => {
      setSupported(ok);
      loadCredentials();
    });
  }, [loadCredentials]);

  const handleRegister = async () => {
    setError(null);
    setSuccess(null);
    setRegistering(true);
    try {
      const saved = await registerBiometricCredential(deviceName.trim() || undefined, user?.email);
      setCredentials((prev) => [saved, ...prev]);
      setSuccess('현재 기기의 생체인식 로그인이 등록되었습니다.');
    } catch (err: any) {
      setError(err?.message || '생체인식 등록에 실패했습니다.');
    } finally {
      setRegistering(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 기기의 생체인식 로그인 등록을 해제하시겠습니까?')) return;
    setError(null);
    setSuccess(null);
    setDeletingId(id);
    try {
      await deleteBiometricCredential(id);
      setCredentials((prev) => {
        const next = prev.filter((item) => item.id !== id);
        if (next.length === 0 && typeof window !== 'undefined') {
          localStorage.removeItem(BIOMETRIC_HINT_EMAIL_KEY);
        }
        return next;
      });
      setSuccess('생체인식 등록이 해제되었습니다.');
    } catch (err: any) {
      setError(err?.message || '생체인식 등록 해제에 실패했습니다.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl bg-sky-50/80 border border-sky-200/80 p-3.5">
        <Fingerprint className="h-5 w-5 text-[#007AFF] shrink-0 mt-0.5" />
        <div className="space-y-1 text-xs text-slate-600">
          <p className="font-semibold text-slate-800">지문 · Face ID 간편 로그인</p>
          <p>
            현재 기기의 생체인식을 등록하면 다음 로그인 시 비밀번호 입력 없이 빠르게 접속할 수 있습니다.
          </p>
        </div>
      </div>

      {supported === false && (
        <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <span>
            현재 브라우저 또는 접속 환경(HTTPS 필수)에서는 기기 생체인식 등록을 지원하지 않습니다.
          </span>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs font-medium text-rose-700">
          <AlertCircle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-start gap-2 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs font-medium text-emerald-700">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
          <span>{success}</span>
        </div>
      )}

      {supported && (
        <div className="space-y-2.5 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5">
          <label className="block text-xs font-semibold text-slate-700">기기 이름</label>
          <input
            type="text"
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            placeholder="예: 내 iPhone"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-base sm:text-sm text-slate-800 focus:border-[#007AFF] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/15"
          />
          <button
            type="button"
            onClick={handleRegister}
            disabled={registering}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#007AFF] py-2.5 text-xs font-semibold text-white shadow-xs active:scale-[0.98] disabled:opacity-60 transition"
          >
            <Plus className="h-4 w-4" />
            <span>{registering ? '생체인식 등록 중...' : '현재 기기 생체인식 등록'}</span>
          </button>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-500">등록된 기기 ({credentials.length})</p>
        {loading ? (
          <div className="py-6 text-center text-xs text-slate-400">불러오는 중...</div>
        ) : credentials.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 py-6 text-center text-xs text-slate-400">
            등록된 생체인식 기기가 없습니다.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200/80 bg-white overflow-hidden">
            {credentials.map((cred) => (
              <div key={cred.id} className="flex items-center justify-between gap-3 px-3.5 py-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                    <Smartphone className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-800">
                      {cred.deviceName}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      등록: {new Date(cred.createdAt).toLocaleDateString('ko-KR')}
                      {cred.lastUsedAt
                        ? ` · 최근: ${new Date(cred.lastUsedAt).toLocaleDateString('ko-KR')}`
                        : ''}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(cred.id)}
                  disabled={deletingId === cred.id}
                  aria-label="생체인식 등록 해제"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-500 disabled:opacity-50 transition"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
