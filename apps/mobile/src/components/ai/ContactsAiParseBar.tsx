'use client';

import React, { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
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
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-violet-700">
          <Sparkles className="h-3.5 w-3.5" />
          AI 명함 / 이메일 서명 자동 입력
        </span>
      </div>
      <div className="flex gap-2">
        <textarea
          rows={2}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="이메일 서명이나 명함 텍스트를 붙여넣으면 이름, 회사, 직책, 연락처를 자동으로 채워줍니다."
          className="flex-1 rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-violet-500 focus:outline-none"
        />
        <button
          type="button"
          disabled={loading || !rawText.trim()}
          onClick={handleParse}
          className="self-end inline-flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          자동 채우기
        </button>
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
};
