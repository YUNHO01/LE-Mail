'use client';

import React, { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { fetchApi } from '@/lib/api';
import { useAiAssistant } from '@/hooks/useAiAssistant';
import { AiParsedCalendarEventDto } from '@lemail/shared-types';

interface CalendarAiParseBarProps {
  onParsed: (event: AiParsedCalendarEventDto) => void;
}

export const CalendarAiParseBar: React.FC<CalendarAiParseBarProps> = ({
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
      const res = await fetchApi<AiParsedCalendarEventDto>('/ai/calendar/parse', {
        method: 'POST',
        body: JSON.stringify({
          rawText,
          referenceDate: new Date().toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul',
        }),
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
    <div className="rounded-xl border border-black/[0.08] bg-[#f5f5f7]/80 px-3 py-2.5 space-y-2">
      <div className="flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-[#0071e3] shrink-0" />
        <input
          type="text"
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && rawText.trim() && !loading) {
              e.preventDefault();
              handleParse();
            }
          }}
          placeholder="자연어로 일정 입력 (예: 내일 오후 3시 3층 회의실에서 주간 미팅 1시간)"
          className="flex-1 rounded-lg border border-black/[0.08] bg-white px-3 py-1.5 text-xs text-[#1d1d1f] placeholder:text-[#86868b] focus:border-[#0071e3] focus:outline-none transition"
        />
        <button
          type="button"
          disabled={loading || !rawText.trim()}
          onClick={handleParse}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#0071e3] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0062c4] disabled:opacity-40 transition shrink-0"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          자동 입력
        </button>
      </div>
      {error && <p className="text-xs text-[#ff3b30]">{error}</p>}
    </div>
  );
};
