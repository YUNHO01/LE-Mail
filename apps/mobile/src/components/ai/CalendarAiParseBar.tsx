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
    <div className="rounded-xl border border-slate-200/80 bg-slate-50/90 px-3 py-2.5 space-y-2">
      <div className="flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-[#007AFF] shrink-0" />
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
          placeholder="자연어로 일정 입력 (예: 내일 오후 3시 회의)"
          className="flex-1 min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#007AFF] focus:outline-none transition"
        />
        <button
          type="button"
          disabled={loading || !rawText.trim()}
          onClick={handleParse}
          className="inline-flex items-center gap-1 rounded-lg bg-[#007AFF] px-3 py-1.5 text-xs font-semibold text-white active:bg-[#0062cc] disabled:opacity-40 transition shrink-0"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          자동 입력
        </button>
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
};
