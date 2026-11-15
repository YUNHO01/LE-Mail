'use client';

import React, { useState } from 'react';
import { Sparkles, Wand2, Languages, Loader2 } from 'lucide-react';
import { fetchApi } from '@/lib/api';
import { useAiAssistant } from '@/hooks/useAiAssistant';
import { AiMailDraftResultDto } from '@lemail/shared-types';

interface MailComposeAiBarProps {
  subject: string;
  bodyText: string;
  bodyHtml: string;
  onApply: (result: { subject?: string; bodyHtml: string; bodyText: string }) => void;
  onLoadingChange?: (loading: boolean) => void;
}

export const MailComposeAiBar: React.FC<MailComposeAiBarProps> = ({
  subject,
  bodyText,
  bodyHtml,
  onApply,
  onLoadingChange,
}) => {
  const { canUseAi } = useAiAssistant();
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canUseAi) return null;

  const runDraft = async (
    mode: 'compose' | 'polish' | 'translate',
    targetLanguage = 'ko',
  ) => {
    try {
      setLoading(true);
      onLoadingChange?.(true);
      setError(null);
      const res = await fetchApi<AiMailDraftResultDto>('/ai/mail/draft', {
        method: 'POST',
        body: JSON.stringify({
          mode,
          prompt: prompt.trim() || undefined,
          subject,
          originalBody: bodyText || bodyHtml,
          targetLanguage,
        }),
      });
      const escapedHtml = res.body
        .split('\n')
        .map((line) => `<p>${line || '<br/>'}</p>`)
        .join('');
      onApply({
        subject: res.subject || undefined,
        bodyHtml: escapedHtml,
        bodyText: res.body,
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
    <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 text-xs font-bold text-violet-700">
          <Sparkles className="h-3.5 w-3.5" />
          AI 작성 도우미
        </span>
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="예: 내일 오전 회의 일정 안내 및 자료 요청 메일 작성"
          className="flex-1 min-w-[200px] rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-violet-500 focus:outline-none"
        />
        <button
          type="button"
          disabled={loading || !prompt.trim()}
          onClick={() => runDraft('compose')}
          className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          초안 생성
        </button>
        <button
          type="button"
          disabled={loading || !(bodyText || bodyHtml).trim()}
          onClick={() => runDraft('polish')}
          className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-violet-50 disabled:opacity-50"
        >
          <Wand2 className="h-3 w-3 text-violet-600" />
          문체 다듬기
        </button>
        <button
          type="button"
          disabled={loading || !(bodyText || bodyHtml).trim()}
          onClick={() => runDraft('translate', 'en')}
          className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-violet-50 disabled:opacity-50"
        >
          <Languages className="h-3 w-3 text-violet-600" />
          영문 번역
        </button>
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
};
