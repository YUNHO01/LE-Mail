'use client';

import React, { useEffect, useRef, useState } from 'react';
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
  FileText,
  Eye,
  Loader2,
} from 'lucide-react';
import { ToggleSwitch } from '@/components/common';

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

export const SignatureSettingsTab: React.FC<{ onDirtyChange?: (dirty: boolean) => void }> = ({
  onDirtyChange,
}) => {
  const { user } = useAuth();
  const [useSignature, setUseSignature] = useState(false);
  const [signatureHtml, setSignatureHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmTemplate, setConfirmTemplate] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const initialRef = useRef<{ useSignature: boolean; signatureHtml: string } | null>(null);
  const userInteractedRef = useRef(false);

  useEffect(() => {
    loadSignature();
  }, []);

  const loadSignature = async () => {
    try {
      setLoading(true);
      const data = await fetchApi<UserSignatureDto>('/users/me/signature');
      if (data) {
        const nextUse = Boolean(data.useSignature);
        const nextHtml = data.signatureHtml || '';
        setUseSignature(nextUse);
        setSignatureHtml(nextHtml);
        initialRef.current = { useSignature: nextUse, signatureHtml: nextHtml };
        userInteractedRef.current = false;
        onDirtyChange?.(false);
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
      initialRef.current = { useSignature, signatureHtml };
      userInteractedRef.current = false;
      setMessage({
        type: 'success',
        text: '서명 설정이 성공적으로 저장되었습니다.',
      });
      onDirtyChange?.(false);
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
    <div className="space-y-6 rounded-2xl border border-black/[0.08] bg-white p-6 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-black/[0.06] pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0071e3]/10 text-[#0071e3]">
            <PenTool className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[#1d1d1f]">메일 서명 관리</h3>
            <p className="text-xs text-[#6e6e73]">
              메일 발송 시 본문 하단에 자동으로 첨부될 개인 서명을 서명 편집기로 작성하고 관리합니다.
            </p>
          </div>
        </div>

        <ToggleSwitch
          checked={useSignature}
          onChange={(next) => {
            userInteractedRef.current = true;
            setUseSignature(next);
            if (initialRef.current) {
              onDirtyChange?.(
                next !== initialRef.current.useSignature ||
                  signatureHtml !== initialRef.current.signatureHtml,
              );
            }
          }}
          color="primary"
          showStatusText={false}
          className="shrink-0"
        />
      </div>

      {/* 상태 메시지 알림 배너 */}
      {message && (
        <div
          className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-xs font-medium ${
            message.type === 'success'
              ? 'border-[#34c759]/30 bg-[#34c759]/10 text-[#248a3d]'
              : 'border-[#ff3b30]/25 bg-[#ff3b30]/[0.06] text-[#d70015]'
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

      {/* 서명 편집기 영역 */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h4 className="text-xs font-semibold text-[#1d1d1f]">서명 내용 작성 (서명 편집기)</h4>
            <p className="text-[11px] text-[#6e6e73] mt-0.5">
              글꼴 스타일, 링크, 표, 로고 이미지 등을 자유롭게 구성할 수 있습니다.
            </p>
          </div>

          {confirmTemplate ? (
            <div className="flex items-center gap-2 rounded-lg border border-black/[0.08] bg-[#f5f5f7] px-3 py-1.5 text-xs">
              <span className="text-[#1d1d1f] font-medium">현재 서명을 기본 서식으로 덮어쓸까요?</span>
              <button
                type="button"
                onClick={() => {
                  userInteractedRef.current = true;
                  setConfirmTemplate(false);
                  applyDefaultTemplate();
                  onDirtyChange?.(true);
                }}
                className="rounded-md bg-[#0071e3] px-2.5 py-1 font-semibold text-white hover:bg-[#0062c4] transition"
              >
                적용
              </button>
              <button
                type="button"
                onClick={() => setConfirmTemplate(false)}
                className="rounded-md px-2 py-1 font-medium text-[#6e6e73] hover:bg-black/[0.05] transition"
              >
                취소
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                const plain = signatureHtml.replace(/<[^>]*>/g, '').trim();
                if (plain) {
                  setConfirmTemplate(true);
                } else {
                  userInteractedRef.current = true;
                  applyDefaultTemplate();
                  onDirtyChange?.(true);
                }
              }}
              className="inline-flex h-9 items-center gap-1.5 px-3.5 rounded-lg border border-black/[0.1] text-[#1d1d1f] bg-white hover:bg-black/[0.03] text-xs font-semibold transition"
            >
              <FileText className="h-3.5 w-3.5 text-[#0071e3]" />
              <span>기본 서식 불러오기</span>
            </button>
          )}
        </div>

        {/* 에디터 컴포넌트 */}
        <div
          onKeyDownCapture={() => {
            userInteractedRef.current = true;
          }}
          onPasteCapture={() => {
            userInteractedRef.current = true;
          }}
          onPointerDownCapture={() => {
            userInteractedRef.current = true;
          }}
          className="border border-black/[0.1] rounded-xl overflow-hidden focus-within:border-[#0071e3] transition min-h-[260px] relative"
        >
          {loading ? (
            <div className="flex h-64 items-center justify-center bg-[#f5f5f7]/60 text-[#86868b]">
              <div className="flex items-center gap-2 text-xs font-medium">
                <Loader2 className="h-4 w-4 animate-spin text-[#0071e3]" />
                <span>서명 설정을 불러오는 중입니다...</span>
              </div>
            </div>
          ) : (
            <DynamicQuillEditor
              value={signatureHtml}
              onChange={(html) => {
                setSignatureHtml(html);
                if (!initialRef.current) return;
                if (userInteractedRef.current) {
                  onDirtyChange?.(
                    useSignature !== initialRef.current.useSignature ||
                      html !== initialRef.current.signatureHtml,
                  );
                } else {
                  initialRef.current.signatureHtml = html;
                }
              }}
              placeholder="여기에 서명으로 표시할 텍스트 및 서식을 작성하세요..."
              minHeight="220px"
            />
          )}
        </div>
      </div>

      {/* 실시간 서명 미리보기 영역 */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2 text-xs font-semibold text-[#1d1d1f]">
          <span className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-[#6e6e73]" />
            <span>실시간 메일 본문 삽입 미리보기</span>
          </span>
          {!useSignature && (
            <span className="rounded-full bg-[#f5f5f7] border border-black/[0.08] px-2.5 py-0.5 text-[11px] font-medium text-[#6e6e73]">
              자동 서명 비활성화됨
            </span>
          )}
        </div>

        <div className="rounded-xl border border-black/[0.08] bg-[#f5f5f7]/70 p-4 min-h-[100px] text-xs">
          <div className="text-[#86868b] italic mb-2 select-none">
            [메일 본문 작성 영역...]
          </div>
          <div className="my-3 border-t border-black/[0.08]" />
          {signatureHtml ? (
            <div
              className="prose prose-xs max-w-none text-[#1d1d1f]"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(signatureHtml) }}
            />
          ) : (
            <div className="text-[#86868b] text-center py-4">
              작성된 서명이 없습니다. 상단 에디터에서 서명을 입력해 주세요.
            </div>
          )}
        </div>
      </div>

      {/* 하단 저장 버튼 */}
      <div className="flex items-center justify-end pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || loading}
          className="inline-flex h-9 items-center justify-center gap-2 px-5 rounded-lg bg-[#0071e3] hover:bg-[#0062c4] text-white text-xs font-semibold shadow-xs transition disabled:opacity-50"
        >
          {saving ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>저장 중...</span>
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              <span>서명 설정 저장</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
