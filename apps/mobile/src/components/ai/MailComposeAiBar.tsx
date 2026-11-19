'use client';

import React, { useMemo, useState } from 'react';
import { Sparkles, Wand2, Languages, Loader2 } from 'lucide-react';
import { fetchApi } from '@/lib/api';
import { useAiAssistant } from '@/hooks/useAiAssistant';
import { plainTextToParagraphHtml, splitComposeBody } from '@/lib/mailComposeAi';
import { AiMailDraftResultDto } from '@lemail/shared-types';

interface MailComposeAiBarProps {
  subject: string;
  bodyText: string;
  bodyHtml: string;
  signatureHtml?: string | null;
  composeMode?: 'new' | 'reply' | 'replyAll' | 'forward' | 'draft';
  onApply: (result: { subject?: string; bodyHtml: string; bodyText: string }) => void;
  onLoadingChange?: (loading: boolean) => void;
}

export const MailComposeAiBar: React.FC<MailComposeAiBarProps> = ({
  subject,
  bodyText,
  bodyHtml,
  signatureHtml,
  composeMode = 'new',
  onApply,
  onLoadingChange,
}) => {
  const { canUseAi } = useAiAssistant();
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const splitResult = useMemo(
    () => splitComposeBody(bodyHtml, signatureHtml),
    [bodyHtml, signatureHtml],
  );
  const editableContent =
    splitResult.editableText || (!splitResult.preservedTailHtml ? bodyText.trim() : '');

  if (!canUseAi) return null;

  const runDraft = async (
    mode: 'compose' | 'polish' | 'translate',
    targetLanguage = 'ko',
  ) => {
    try {
      setLoading(true);
      onLoadingChange?.(true);
      setError(null);

      const isReplyMode = composeMode === 'reply' || composeMode === 'replyAll';
      const apiMode =
        mode === 'compose' && isReplyMode && splitResult.quotedText ? 'reply' : mode;
      const originalBody =
        mode === 'compose'
          ? splitResult.quotedText || editableContent || undefined
          : editableContent;

      const res = await fetchApi<AiMailDraftResultDto>('/ai/mail/draft', {
        method: 'POST',
        body: JSON.stringify({
          mode: apiMode,
          prompt: prompt.trim() || undefined,
          subject,
          originalBody,
          targetLanguage,
        }),
      });
      const draftHtml = plainTextToParagraphHtml(res.body);
      const nextBodyHtml = `${draftHtml}${splitResult.editableImagesHtml}${splitResult.preservedTailHtml}`;
      const nextBodyText = splitResult.preservedTailText
        ? `${res.body}\n\n${splitResult.preservedTailText}`
        : res.body;

      onApply({
        subject: res.subject || undefined,
        bodyHtml: nextBodyHtml,
        bodyText: nextBodyText,
      });
      if (mode === 'compose') setPrompt('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      onLoadingChange?.(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200/80 bg-slate-50/90 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800">
          <Sparkles className="h-3.5 w-3.5 text-[#007AFF]" />
          AI 작성 도우미
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={loading || !editableContent}
            onClick={() => runDraft('polish')}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200/80 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 active:bg-slate-100 disabled:opacity-40 transition"
          >
            <Wand2 className="h-3 w-3 text-[#007AFF]" />
            문체 다듬기
          </button>
          <button
            type="button"
            disabled={loading || !editableContent}
            onClick={() => runDraft('translate', 'en')}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200/80 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 active:bg-slate-100 disabled:opacity-40 transition"
          >
            <Languages className="h-3 w-3 text-[#007AFF]" />
            영문 번역
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && prompt.trim() && !loading) {
              e.preventDefault();
              runDraft('compose');
            }
          }}
          placeholder="예: 내일 오전 회의 일정 안내 메일 작성"
          className="flex-1 min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#007AFF] focus:outline-none transition"
        />
        <button
          type="button"
          disabled={loading || !prompt.trim()}
          onClick={() => runDraft('compose')}
          className="inline-flex items-center gap-1 rounded-lg bg-[#007AFF] px-3 py-2 text-xs font-semibold text-white active:bg-[#0062cc] disabled:opacity-40 transition shrink-0"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          초안 생성
        </button>
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
};
