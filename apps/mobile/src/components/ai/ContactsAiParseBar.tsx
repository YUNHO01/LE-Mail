'use client';

import React, { useState } from 'react';
import { Sparkles, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { fetchApi } from '@/lib/api';
import { useAiAssistant } from '@/hooks/useAiAssistant';
import { AiParsedContactDto } from '@lemail/shared-types';

interface ContactsAiParseBarProps {
  onParsed: (contact: AiParsedContactDto) => void;
}

export const ContactsAiParseBar: React.FC<ContactsAiParseBarProps> = ({
  onParsed,
}) => {
  const { canUseAi } = useAiAssistant();
  const [expanded, setExpanded] = useState(false);
  const [rawText, setRawText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canUseAi) return null;

  const handleParse = async () => {
    if (!rawText.trim()) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetchApi<AiParsedContactDto>('/ai/contacts/parse', {
        method: 'POST',
        body: JSON.stringify({ rawText }),
      });
      onParsed(res);
      setRawText('');
      setExpanded(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 space-y-2.5 shadow-2xs">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between text-left"
      >
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800">
          <Sparkles className="h-3.5 w-3.5 text-[#007AFF]" />
          AI 명함 / 서명 자동 입력
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#007AFF]">
          {expanded ? '접기' : '텍스트 붙여넣기'}
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </span>
      </button>

      {expanded && (
        <div className="space-y-2 pt-0.5">
          <textarea
            rows={2}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="이메일 서명이나 명함 텍스트를 붙여넣으면 자동으로 채워줍니다."
            className="w-full rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#007AFF] focus:bg-white focus:outline-none transition"
          />
          <div className="flex items-center justify-end">
            <button
              type="button"
              disabled={loading || !rawText.trim()}
              onClick={handleParse}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#007AFF] px-3 py-1.5 text-xs font-semibold text-white active:bg-[#0062cc] disabled:opacity-40 transition"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              자동 채우기
            </button>
          </div>
          {error && <p className="text-xs text-rose-600">{error}</p>}
        </div>
      )}
    </div>
  );
};
