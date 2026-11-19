'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useAuth } from '@/contexts/AuthContext';
import { fetchApi } from '@/lib/api';
import { sanitizeHtml } from '@/lib/sanitize';
import { UserSignatureDto } from '@lemail/shared-types';
import {
  PenTool,
  Save,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Sparkles,
  Eye,
  Loader2,
} from 'lucide-react';

const DynamicQuillEditor = dynamic(() => import('@/components/mail/QuillEditor'), {
  ssr: false,
  loading: () => (
    <div className="flex h-48 items-center justify-center bg-slate-50/50 text-slate-400">
      <div className="flex items-center gap-2 text-xs font-medium">
        <Loader2 className="h-4 w-4 animate-spin text-sky-600" />
        <span>에디터 로딩 중...</span>
      </div>
    </div>
  ),
});

export const SignatureSettingsTab: React.FC = () => {
  const { user } = useAuth();
  const [useSignature, setUseSignature] = useState(false);
  const [signatureHtml, setSignatureHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadSignature();
  }, []);

  const loadSignature = async () => {
    try {
      setLoading(true);
      const data = await fetchApi<UserSignatureDto>('/users/me/signature');
      if (data) {
        setUseSignature(Boolean(data.useSignature));
        setSignatureHtml(data.signatureHtml || '');
      }
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err.message || '서명 설정을 불러오지 못했습니다.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setMessage(null);
      await fetchApi<UserSignatureDto>('/users/me/signature', {
        method: 'PUT',
        body: JSON.stringify({
          useSignature,
          signatureHtml,
        }),
      });
      setMessage({
        type: 'success',
        text: '서명 설정이 성공적으로 저장되었습니다.',
      });
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err.message || '서명 저장 중 오류가 발생했습니다.',
      });
    } finally {
      setSaving(false);
    }
  };

  // 기본 비즈니스 서명 템플릿 주입
  const applyDefaultTemplate = () => {
    const userName = user?.name || '사용자';
    const userEmail = user?.email || 'user@example.com';
    const template = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #334155; line-height: 1.5; font-size: 13px; margin-top: 16px; padding-top: 12px; border-top: 1px solid #cbd5e1;">
  <p style="margin: 0 0 4px 0; font-size: 14px; font-weight: bold; color: #0f172a;">${userName}</p>
  <p style="margin: 0 0 4px 0; color: #64748b; font-size: 12px;">LEMail 엔터프라이즈 팀</p>
  <p style="margin: 0; color: #475569; font-size: 12px;">
    <b>Email:</b> <a href="mailto:${userEmail}" style="color: #0284c7; text-decoration: none;">${userEmail}</a>
  </p>
</div>
`.trim();

    setSignatureHtml(template);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <PenTool className="h-4 w-4 text-[#007AFF]" />
          <span className="text-sm font-bold text-slate-900">서명 자동 첨부</span>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={useSignature}
            onChange={(e) => setUseSignature(e.target.checked)}
            aria-label="서명 자동 첨부 사용"
            className="sr-only peer"
          />
          <div className="h-6 w-11 rounded-full bg-slate-200 peer-checked:bg-[#007AFF] relative transition after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-5" />
        </label>
      </div>

      {/* 상태 메시지 알림 배너 */}
      {message && (
        <div
          className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-rose-50 text-rose-700'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* DHTML 서명 편집기 */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-slate-700">서명 내용 작성</h3>
          <button
            type="button"
            onClick={applyDefaultTemplate}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 text-slate-700 bg-slate-50 text-xs font-semibold"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            <span>기본 서식</span>
          </button>
        </div>

        {/* 에디터 컴포넌트 */}
        <div className="border border-slate-200 rounded-xl overflow-hidden focus-within:border-[#007AFF] transition min-h-[220px] relative">
          {loading ? (
            <div className="flex h-64 items-center justify-center bg-slate-50/50 text-slate-400">
              <div className="flex items-center gap-2 text-xs font-medium">
                <Loader2 className="h-4 w-4 animate-spin text-sky-600" />
                <span>서명 설정을 불러오는 중입니다...</span>
              </div>
            </div>
          ) : (
            <DynamicQuillEditor
              value={signatureHtml}
              onChange={(html) => setSignatureHtml(html)}
              placeholder="여기에 서명으로 표시할 텍스트 및 서식을 작성하세요..."
              minHeight="220px"
            />
          )}
        </div>
      </div>

      {/* 실시간 서명 미리보기 */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
          <Eye className="h-4 w-4 text-slate-500" />
          <span>실시간 메일 본문 삽입 미리보기</span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 min-h-[80px] text-xs">
          <div className="text-slate-400 italic mb-2 select-none">
            [메일 본문 작성 영역...]
          </div>
          <div className="my-2.5 border-t border-slate-200" />
          {signatureHtml ? (
            <div
              className="prose prose-xs max-w-none text-slate-800"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(signatureHtml) }}
            />
          ) : (
            <div className="text-slate-400 text-center py-3">
              작성된 서명이 없습니다.
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving || loading}
        className="w-full py-2.5 rounded-xl bg-[#007AFF] text-white text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
      >
        {saving ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>저장 중...</span>
          </>
        ) : (
          <>
            <Save className="h-3.5 w-3.5" />
            <span>서명 설정 저장</span>
          </>
        )}
      </button>
    </div>
  );
};
