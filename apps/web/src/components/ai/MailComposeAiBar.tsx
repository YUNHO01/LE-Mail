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
    <div className="rounded-xl border border-black/[0.08] bg-[#f5f5f7]/80 px-3 py-2.5 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1d1d1f] shrink-0">
          <Sparkles className="h-3.5 w-3.5 text-[#0071e3]" />
          AI 작성 도우미
        </span>
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
          placeholder="예: 내일 오전 회의 일정 안내 및 자료 요청 메일 작성"
          className="flex-1 min-w-[200px] rounded-lg border border-black/[0.08] bg-white px-3 py-1.5 text-xs text-[#1d1d1f] placeholder:text-[#86868b] focus:border-[#0071e3] focus:outline-none transition"
        />
        <button
          type="button"
          disabled={loading || !prompt.trim()}
          onClick={() => runDraft('compose')}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#0071e3] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0062c4] disabled:opacity-40 transition"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          초안 생성
        </button>
        <button
          type="button"
          disabled={loading || !(bodyText || bodyHtml).trim()}
          onClick={() => runDraft('polish')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-2.5 py-1.5 text-xs font-medium text-[#1d1d1f] hover:bg-black/[0.03] disabled:opacity-40 transition"
        >
          <Wand2 className="h-3 w-3 text-[#0071e3]" />
          문체 다듬기
        </button>
        <button
          type="button"
          disabled={loading || !(bodyText || bodyHtml).trim()}
          onClick={() => runDraft('translate', 'en')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-2.5 py-1.5 text-xs font-medium text-[#1d1d1f] hover:bg-black/[0.03] disabled:opacity-40 transition"
        >
          <Languages className="h-3 w-3 text-[#0071e3]" />
          영문 번역
        </button>
      </div>
      {error && <p className="text-xs text-[#ff3b30]">{error}</p>}
    </div>
  );
};
