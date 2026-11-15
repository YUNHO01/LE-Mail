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
    <div className="rounded-xl border border-black/[0.08] bg-[#f5f5f7]/80 px-3.5 py-2.5 space-y-2.5">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between text-left"
      >
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1d1d1f]">
          <Sparkles className="h-3.5 w-3.5 text-[#0071e3]" />
          AI 명함 / 이메일 서명 자동 입력
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#0071e3]">
          {expanded ? '접기' : '텍스트 붙여넣기'}
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </span>
      </button>

      {expanded && (
        <div className="space-y-2 pt-0.5">
          <div className="flex gap-2">
            <textarea
              rows={2}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="이메일 서명이나 명함 텍스트를 붙여넣으면 이름, 회사, 직책, 연락처를 자동으로 채워줍니다."
              className="flex-1 rounded-lg border border-black/[0.08] bg-white px-3 py-1.5 text-xs text-[#1d1d1f] placeholder:text-[#86868b] focus:border-[#0071e3] focus:outline-none transition"
            />
            <button
              type="button"
              disabled={loading || !rawText.trim()}
              onClick={handleParse}
              className="self-end inline-flex items-center gap-1.5 rounded-lg bg-[#0071e3] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0062c4] disabled:opacity-40 transition shrink-0"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              자동 채우기
            </button>
          </div>
          {error && <p className="text-xs text-[#ff3b30]">{error}</p>}
        </div>
      )}
    </div>
  );
};
