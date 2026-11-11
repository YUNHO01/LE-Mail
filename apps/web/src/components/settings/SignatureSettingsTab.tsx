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
    <div className="space-y-6 w-full">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-base font-bold tracking-tight text-slate-900">메일 서명 관리</h2>
          <p className="text-xs text-slate-500 mt-1">
            메일 발송 시 본문 하단에 자동으로 첨부될 개인 서명을 DHTML 에디터로 작성하고 관리합니다.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving || loading}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-sm transition disabled:opacity-50"
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

      {/* 상태 메시지 알림 배너 */}
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

      {/* 서명 사용 여부 토글 카드 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex items-center justify-between">
        <div className="space-y-1">
          <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <PenTool className="h-4 w-4 text-sky-600" />
            <span>서명 자동 첨부 사용</span>
          </div>
          <p className="text-xs text-slate-500">
            새 메일을 작성할 때 등록된 DHTML 서명을 본문 하단에 자동으로 삽입합니다.
          </p>
        </div>

        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={useSignature}
            onChange={(e) => setUseSignature(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-600"></div>
        </label>
      </div>

      {/* DHTML 서명 편집기 카드 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">서명 내용 작성 (DHTML 에디터)</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              글꼴 스타일, 링크, 표, 로고 이미지 등을 자유롭게 구성할 수 있습니다.
            </p>
          </div>

          <button
            type="button"
            onClick={applyDefaultTemplate}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 bg-slate-50 hover:bg-slate-100 text-xs font-semibold transition"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            <span>기본 서식 불러오기</span>
          </button>
        </div>

        {/* 에디터 컴포넌트 */}
        <div className="border border-slate-200 rounded-xl overflow-hidden focus-within:border-sky-500 transition min-h-[260px] relative">
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

      {/* 실시간 서명 미리보기 카드 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
          <Eye className="h-4 w-4 text-slate-500" />
          <span>실시간 메일 본문 삽입 미리보기</span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 min-h-[100px] text-xs">
          <div className="text-slate-400 italic mb-2 select-none">
            [메일 본문 작성 영역...]
          </div>
          <div className="my-3 border-t border-slate-200" />
          {signatureHtml ? (
            <div
              className="prose prose-xs max-w-none text-slate-800"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(signatureHtml) }}
            />
          ) : (
            <div className="text-slate-400 text-center py-4">
              작성된 서명이 없습니다. 상단 에디터에서 서명을 입력해 주세요.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
