'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles,
  FileText,
  Reply,
  Languages,
  UserPlus,
  CalendarPlus,
  Image as ImageIcon,
  Loader2,
  CheckCircle2,
  Copy,
  RefreshCw,
  X,
} from 'lucide-react';
import { fetchApi, contactsApi } from '@/lib/api';
import { useAiAssistant } from '@/hooks/useAiAssistant';
import {
  AiImageAnalysisResultDto,
  AiMailDraftResultDto,
  AiMailSummaryResultDto,
  AiParsedCalendarEventDto,
  AiParsedContactDto,
} from '@lemail/shared-types';

interface AttachmentItem {
  id: string;
  filename: string;
  contentType: string;
}

function formatDateTime24(value?: string | null): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}$/.test(trimmed)) return trimmed;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) {
    const m = /^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})/.exec(trimmed);
    return m ? `${m[1]} ${m[2]}` : trimmed;
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toIsoDateTime(value: string): string {
  const trimmed = value.trim();
  const normalized = /^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}$/.test(trimmed)
    ? trimmed.replace(' ', 'T')
    : trimmed;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? trimmed : d.toISOString();
}

const summaryClientCache = new Map<string, AiMailSummaryResultDto>();

interface MailAiAssistantPanelProps {
  mailId: string;
  subject: string;
  senderName?: string;
  senderEmail?: string;
  bodyHtml?: string;
  bodyText?: string;
  attachments?: AttachmentItem[];
  onReplyWithDraft?: (draftBody: string) => void;
}

export const MailAiAssistantPanel: React.FC<MailAiAssistantPanelProps> = ({
  mailId,
  subject,
  senderName,
  senderEmail,
  bodyHtml,
  bodyText,
  attachments = [],
  onReplyWithDraft,
}) => {
  const { loaded, canUseAi, canAnalyzeImage, autoSummarizeOnRead } = useAiAssistant();

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [autoSummarizing, setAutoSummarizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const [summaryResult, setSummaryResult] = useState<AiMailSummaryResultDto | null>(null);
  const [draftResult, setDraftResult] = useState<AiMailDraftResultDto | null>(null);
  const [contactDraft, setContactDraft] = useState<AiParsedContactDto | null>(null);
  const [calendarDraft, setCalendarDraft] = useState<AiParsedCalendarEventDto | null>(null);
  const [imageResult, setImageResult] = useState<AiImageAnalysisResultDto | null>(null);
  const [selectedImageIdx, setSelectedImageIdx] = useState(0);
  const lastAutoSummarizedMailIdRef = useRef<string | null>(null);

  const imageCandidates = useMemo(() => {
    const list: { label: string; attachmentId?: string; dataUrl?: string }[] = [];
    for (const att of attachments) {
      if (att.contentType?.startsWith('image/')) {
        list.push({ label: att.filename || '첨부 이미지', attachmentId: att.id });
      }
    }
    if (bodyHtml) {
      const regex = /src=["'](data:image\/[^"']+)["']/gi;
      let match: RegExpExecArray | null;
      let idx = 1;
      while ((match = regex.exec(bodyHtml)) !== null) {
        list.push({ label: `본문 인라인 이미지 #${idx++}`, dataUrl: match[1] });
      }
    }
    return list;
  }, [attachments, bodyHtml]);

  const resetResults = () => {
    setError(null);
    setStatusMsg(null);
    setSummaryResult(null);
    setDraftResult(null);
    setContactDraft(null);
    setCalendarDraft(null);
    setImageResult(null);
  };

  useEffect(() => {
    setError(null);
    setStatusMsg(null);
    setDraftResult(null);
    setContactDraft(null);
    setCalendarDraft(null);
    setImageResult(null);
    setAutoSummarizing(false);

    if (!mailId) {
      setSummaryResult(null);
      return;
    }

    const cached = summaryClientCache.get(mailId);
    if (cached) {
      setSummaryResult(cached);
      return;
    }

    setSummaryResult(null);

    if (!loaded || !canUseAi || !autoSummarizeOnRead) return;
    if (!bodyHtml?.trim() && !bodyText?.trim()) return;
    if (lastAutoSummarizedMailIdRef.current === mailId) return;

    let cancelled = false;
    lastAutoSummarizedMailIdRef.current = mailId;
    setAutoSummarizing(true);

    fetchApi<AiMailSummaryResultDto>('/ai/mail/summarize', {
      method: 'POST',
      body: JSON.stringify({
        mailId,
        subject,
        sender: senderName ? `${senderName} <${senderEmail || ''}>` : senderEmail,
        bodyHtml,
        bodyText,
      }),
    })
      .then((res) => {
        if (cancelled) return;
        summaryClientCache.set(mailId, res);
        setSummaryResult(res);
      })
      .catch(() => {
        // 자동 요약 실패 시 메일 읽기를 방해하지 않도록 조용히 무시
      })
      .finally(() => {
        if (!cancelled) {
          setAutoSummarizing(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [mailId, loaded, canUseAi, autoSummarizeOnRead, subject, senderName, senderEmail, bodyHtml, bodyText]);

  if (!canUseAi) return null;

  const handleSummarize = async (forceRefresh = false) => {
    try {
      if (!forceRefresh && mailId && summaryClientCache.has(mailId)) {
        resetResults();
        setSummaryResult(summaryClientCache.get(mailId)!);
        return;
      }
      resetResults();
      setBusyAction('summarize');
      const res = await fetchApi<AiMailSummaryResultDto>('/ai/mail/summarize', {
        method: 'POST',
        body: JSON.stringify({
          mailId,
          forceRefresh,
          subject,
          sender: senderName ? `${senderName} <${senderEmail || ''}>` : senderEmail,
          bodyHtml,
          bodyText,
        }),
      });
      if (mailId) {
        summaryClientCache.set(mailId, res);
      }
      setSummaryResult(res);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyAction(null);
    }
  };

  const handleDraft = async (mode: 'reply' | 'translate') => {
    try {
      resetResults();
      setBusyAction(mode);
      const res = await fetchApi<AiMailDraftResultDto>('/ai/mail/draft', {
        method: 'POST',
        body: JSON.stringify({
          mode,
          subject,
          originalBody: bodyText || bodyHtml || '',
          targetLanguage: 'ko',
        }),
      });
      setDraftResult(res);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyAction(null);
    }
  };

  const handleExtractContact = async () => {
    try {
      resetResults();
      setBusyAction('contact');
      const res = await fetchApi<AiParsedContactDto>('/ai/contacts/parse', {
        method: 'POST',
        body: JSON.stringify({
          rawText: bodyText || bodyHtml || '',
          senderName,
          senderEmail,
        }),
      });
      setContactDraft(res);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyAction(null);
    }
  };

  const handleSaveContact = async () => {
    if (!contactDraft) return;
    try {
      setBusyAction('save-contact');
      await contactsApi.createContact({
        name: contactDraft.name || senderName || contactDraft.email || '이름 없음',
        email: contactDraft.email || senderEmail || '',
        company: contactDraft.company || undefined,
        department: contactDraft.department || undefined,
        position: contactDraft.jobTitle || undefined,
        phone: contactDraft.mobile || contactDraft.phone || undefined,
        companyPhone: contactDraft.phone || undefined,
        address: contactDraft.address || undefined,
        websiteUrl: contactDraft.websiteUrl || undefined,
        memo: contactDraft.memo || undefined,
      });
      setStatusMsg('주소록에 연락처가 등록되었습니다.');
      setContactDraft(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyAction(null);
    }
  };

  const handleExtractCalendar = async () => {
    try {
      resetResults();
      setBusyAction('calendar');
      const res = await fetchApi<AiParsedCalendarEventDto>('/ai/calendar/parse', {
        method: 'POST',
        body: JSON.stringify({
          rawText: `${subject}\n\n${bodyText || bodyHtml || ''}`,
          referenceDate: new Date().toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul',
        }),
      });
      setCalendarDraft({
        ...res,
        startAt: formatDateTime24(res.startAt),
        endAt: formatDateTime24(res.endAt),
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyAction(null);
    }
  };

  const handleSaveCalendar = async () => {
    if (!calendarDraft) return;
    try {
      setBusyAction('save-calendar');
      await fetchApi('/calendar/events', {
        method: 'POST',
        body: JSON.stringify({
          title: calendarDraft.title,
          description: calendarDraft.description || undefined,
          location: calendarDraft.location || undefined,
          startAt: toIsoDateTime(calendarDraft.startAt),
          endAt: toIsoDateTime(calendarDraft.endAt),
          isAllDay: Boolean(calendarDraft.isAllDay),
          sourceMailId: mailId,
        }),
      });
      setStatusMsg('일정이 캘린더에 등록되었습니다.');
      setCalendarDraft(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyAction(null);
    }
  };

  const handleAnalyzeImage = async () => {
    const target = imageCandidates[selectedImageIdx];
    if (!target) return;
    try {
      resetResults();
      setBusyAction('image');
      const res = await fetchApi<AiImageAnalysisResultDto>('/ai/mail/analyze-image', {
        method: 'POST',
        body: JSON.stringify({
          mailId,
          attachmentId: target.attachmentId,
          imageDataUrl: target.dataUrl,
          extractContact: true,
        }),
      });
      setImageResult(res);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyAction(null);
    }
  };

  const isBusy = busyAction !== null;

  return (
    <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-2.5 space-y-2.5">
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-800 mr-1 shrink-0 whitespace-nowrap">
          <Sparkles className="h-3.5 w-3.5 text-[#007AFF]" />
          AI 도우미
        </span>

        <button
          type="button"
          disabled={isBusy}
          onClick={() => handleSummarize(false)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 active:bg-slate-100 disabled:opacity-40 transition shrink-0 whitespace-nowrap"
        >
          {busyAction === 'summarize' ? <Loader2 className="h-3 w-3 animate-spin text-[#007AFF]" /> : <FileText className="h-3 w-3 text-[#007AFF]" />}
          요약 / 할 일
        </button>

        <button
          type="button"
          disabled={isBusy}
          onClick={() => handleDraft('reply')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 active:bg-slate-100 disabled:opacity-40 transition shrink-0 whitespace-nowrap"
        >
          {busyAction === 'reply' ? <Loader2 className="h-3 w-3 animate-spin text-[#007AFF]" /> : <Reply className="h-3 w-3 text-[#007AFF]" />}
          답장 초안
        </button>

        <button
          type="button"
          disabled={isBusy}
          onClick={() => handleDraft('translate')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 active:bg-slate-100 disabled:opacity-40 transition shrink-0 whitespace-nowrap"
        >
          {busyAction === 'translate' ? <Loader2 className="h-3 w-3 animate-spin text-[#007AFF]" /> : <Languages className="h-3 w-3 text-[#007AFF]" />}
          한국어 번역
        </button>

        <button
          type="button"
          disabled={isBusy}
          onClick={handleExtractContact}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 active:bg-slate-100 disabled:opacity-40 transition shrink-0 whitespace-nowrap"
        >
          {busyAction === 'contact' ? <Loader2 className="h-3 w-3 animate-spin text-[#007AFF]" /> : <UserPlus className="h-3 w-3 text-[#007AFF]" />}
          서명 → 주소록
        </button>

        <button
          type="button"
          disabled={isBusy}
          onClick={handleExtractCalendar}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 active:bg-slate-100 disabled:opacity-40 transition shrink-0 whitespace-nowrap"
        >
          {busyAction === 'calendar' ? <Loader2 className="h-3 w-3 animate-spin text-[#007AFF]" /> : <CalendarPlus className="h-3 w-3 text-[#007AFF]" />}
          일정 추출
        </button>

        {canAnalyzeImage && imageCandidates.length > 0 && (
          <div className="inline-flex items-center gap-1 shrink-0">
            {imageCandidates.length > 1 && (
              <select
                value={selectedImageIdx}
                onChange={(e) => setSelectedImageIdx(Number(e.target.value))}
                className="rounded-lg border border-slate-200/80 bg-white px-2 py-1.5 text-xs text-slate-700"
              >
                {imageCandidates.map((img, i) => (
                  <option key={i} value={i}>
                    {img.label}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              disabled={isBusy}
              onClick={handleAnalyzeImage}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 active:bg-slate-100 disabled:opacity-40 transition whitespace-nowrap"
            >
              {busyAction === 'image' ? <Loader2 className="h-3 w-3 animate-spin text-[#007AFF]" /> : <ImageIcon className="h-3 w-3 text-[#007AFF]" />}
              이미지 해석
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </div>
      )}

      {statusMsg && (
        <div className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {statusMsg}
        </div>
      )}

      {autoSummarizing && !summaryResult && (
        <div className="flex items-center gap-2 rounded-xl border border-[#007AFF]/20 bg-[#007AFF]/[0.05] px-3.5 py-2.5 text-xs text-slate-700">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-[#007AFF] shrink-0" />
          <span>AI가 메일 핵심 내용을 자동으로 요약하고 있습니다...</span>
        </div>
      )}

      {summaryResult && (
        <div className="relative rounded-xl border border-slate-200/80 bg-white p-3.5 text-xs space-y-2 shadow-2xs">
          <div className="flex items-center justify-between gap-2 pr-6">
            <div className="flex items-center gap-2">
              <p className="font-bold text-slate-800">
                {autoSummarizeOnRead ? 'AI 자동 요약' : '메일 요약'}
              </p>
              {summaryResult.cached && (
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                  저장된 요약
                </span>
              )}
            </div>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => handleSummarize(true)}
              title="최신 기준으로 다시 요약"
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-[#007AFF] active:bg-[#007AFF]/10 disabled:opacity-40 transition"
            >
              <RefreshCw className={`h-3 w-3 ${busyAction === 'summarize' ? 'animate-spin' : ''}`} />
              다시 요약
            </button>
          </div>
          <button
            type="button"
            onClick={() => setSummaryResult(null)}
            className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{summaryResult.summary}</p>
          {summaryResult.actionItems.length > 0 && (
            <div>
              <p className="font-semibold text-[#007AFF] mb-1">할 일 (Action Items)</p>
              <ul className="list-disc pl-4 space-y-0.5 text-slate-600">
                {summaryResult.actionItems.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          {summaryResult.keyDates && summaryResult.keyDates.length > 0 && (
            <div>
              <p className="font-semibold text-[#007AFF] mb-1">주요 일정</p>
              <ul className="list-disc pl-4 space-y-0.5 text-slate-600">
                {summaryResult.keyDates.map((d, idx) => (
                  <li key={idx}>{d}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {draftResult && (
        <div className="relative rounded-xl border border-slate-200/80 bg-white p-3.5 text-xs space-y-2 shadow-2xs">
          <button
            type="button"
            onClick={() => setDraftResult(null)}
            className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <p className="font-bold text-slate-800">AI 생성 결과</p>
          <pre className="whitespace-pre-wrap font-sans text-slate-700 bg-slate-50 rounded-lg p-3 border border-slate-100">
            {draftResult.body}
          </pre>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(draftResult.body);
                setStatusMsg('클립보드에 복사되었습니다.');
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 active:bg-slate-50"
            >
              <Copy className="h-3 w-3" />
              복사
            </button>
            {onReplyWithDraft && (
              <button
                type="button"
                onClick={() => onReplyWithDraft(draftResult.body)}
                className="inline-flex items-center gap-1 rounded-lg bg-[#007AFF] px-3 py-1.5 text-xs font-semibold text-white active:bg-[#0062cc]"
              >
                <Reply className="h-3 w-3" />
                답장 화면으로 이동
              </button>
            )}
          </div>
        </div>
      )}

      {contactDraft && (
        <div className="relative rounded-xl border border-slate-200/80 bg-white p-3.5 text-xs space-y-2.5 shadow-2xs">
          <button
            type="button"
            onClick={() => setContactDraft(null)}
            className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <p className="font-bold text-slate-800">추출된 연락처 확인</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <input
              value={contactDraft.name || ''}
              onChange={(e) => setContactDraft({ ...contactDraft, name: e.target.value })}
              placeholder="이름"
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 focus:border-[#007AFF] focus:outline-none"
            />
            <input
              value={contactDraft.email || ''}
              onChange={(e) => setContactDraft({ ...contactDraft, email: e.target.value })}
              placeholder="이메일"
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 focus:border-[#007AFF] focus:outline-none"
            />
            <input
              value={contactDraft.company || ''}
              onChange={(e) => setContactDraft({ ...contactDraft, company: e.target.value })}
              placeholder="회사"
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 focus:border-[#007AFF] focus:outline-none"
            />
            <input
              value={contactDraft.department || ''}
              onChange={(e) => setContactDraft({ ...contactDraft, department: e.target.value })}
              placeholder="부서"
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 focus:border-[#007AFF] focus:outline-none"
            />
            <input
              value={contactDraft.jobTitle || ''}
              onChange={(e) => setContactDraft({ ...contactDraft, jobTitle: e.target.value })}
              placeholder="직책"
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 focus:border-[#007AFF] focus:outline-none"
            />
            <input
              value={contactDraft.mobile || contactDraft.phone || ''}
              onChange={(e) => setContactDraft({ ...contactDraft, mobile: e.target.value })}
              placeholder="연락처"
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 focus:border-[#007AFF] focus:outline-none"
            />
          </div>
          <button
            type="button"
            disabled={isBusy}
            onClick={handleSaveContact}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#007AFF] px-3 py-1.5 text-xs font-semibold text-white active:bg-[#0062cc]"
          >
            <UserPlus className="h-3.5 w-3.5" />
            주소록에 저장
          </button>
        </div>
      )}

      {calendarDraft && (
        <div className="relative rounded-xl border border-slate-200/80 bg-white p-3.5 text-xs space-y-2.5 shadow-2xs">
          <button
            type="button"
            onClick={() => setCalendarDraft(null)}
            className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <p className="font-bold text-slate-800">추출된 일정 확인</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              value={calendarDraft.title}
              onChange={(e) => setCalendarDraft({ ...calendarDraft, title: e.target.value })}
              placeholder="일정 제목"
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 sm:col-span-2 focus:border-[#007AFF] focus:outline-none"
            />
            <input
              value={calendarDraft.startAt}
              onChange={(e) => setCalendarDraft({ ...calendarDraft, startAt: e.target.value })}
              placeholder="시작 일시"
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 focus:border-[#007AFF] focus:outline-none"
            />
            <input
              value={calendarDraft.endAt}
              onChange={(e) => setCalendarDraft({ ...calendarDraft, endAt: e.target.value })}
              placeholder="종료 일시"
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 focus:border-[#007AFF] focus:outline-none"
            />
            <input
              value={calendarDraft.location || ''}
              onChange={(e) => setCalendarDraft({ ...calendarDraft, location: e.target.value })}
              placeholder="장소"
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 sm:col-span-2 focus:border-[#007AFF] focus:outline-none"
            />
          </div>
          <button
            type="button"
            disabled={isBusy}
            onClick={handleSaveCalendar}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#007AFF] px-3 py-1.5 text-xs font-semibold text-white active:bg-[#0062cc]"
          >
            <CalendarPlus className="h-3.5 w-3.5" />
            일정에 저장
          </button>
        </div>
      )}

      {imageResult && (
        <div className="relative rounded-xl border border-slate-200/80 bg-white p-3.5 text-xs space-y-2 shadow-2xs">
          <button
            type="button"
            onClick={() => setImageResult(null)}
            className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <p className="font-bold text-slate-800">이미지 AI 해석 결과</p>
          <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">
            {imageResult.description}
          </p>
          {imageResult.extractedText && (
            <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-100 text-slate-600 whitespace-pre-wrap">
              <span className="font-semibold text-slate-700">추출된 텍스트: </span>
              {imageResult.extractedText}
            </div>
          )}
          {imageResult.detectedContact && (
            <button
              type="button"
              onClick={() => {
                setContactDraft(imageResult.detectedContact!);
                setImageResult(null);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#007AFF] px-3 py-1.5 text-xs font-semibold text-white active:bg-[#0062cc]"
            >
              <UserPlus className="h-3.5 w-3.5" />
              감지된 명함 연락처 → 주소록 추가
            </button>
          )}
        </div>
      )}
    </div>
  );
};
