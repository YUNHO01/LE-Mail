'use client';

import React, { useMemo, useState } from 'react';
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
  const { canUseAi, canAnalyzeImage } = useAiAssistant();

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const [summaryResult, setSummaryResult] = useState<AiMailSummaryResultDto | null>(null);
  const [draftResult, setDraftResult] = useState<AiMailDraftResultDto | null>(null);
  const [contactDraft, setContactDraft] = useState<AiParsedContactDto | null>(null);
  const [calendarDraft, setCalendarDraft] = useState<AiParsedCalendarEventDto | null>(null);
  const [imageResult, setImageResult] = useState<AiImageAnalysisResultDto | null>(null);
  const [selectedImageIdx, setSelectedImageIdx] = useState(0);

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

  if (!canUseAi) return null;

  const resetResults = () => {
    setError(null);
    setStatusMsg(null);
    setSummaryResult(null);
    setDraftResult(null);
    setContactDraft(null);
    setCalendarDraft(null);
    setImageResult(null);
  };

  const handleSummarize = async () => {
    try {
      resetResults();
      setBusyAction('summarize');
      const res = await fetchApi<AiMailSummaryResultDto>('/ai/mail/summarize', {
        method: 'POST',
        body: JSON.stringify({
          subject,
          sender: senderName ? `${senderName} <${senderEmail || ''}>` : senderEmail,
          bodyHtml,
          bodyText,
        }),
      });
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
    <div className="border-b border-violet-100 bg-violet-50/40 px-6 py-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-violet-700 mr-1">
          <Sparkles className="h-3.5 w-3.5" />
          AI 도우미
        </span>

        <button
          type="button"
          disabled={isBusy}
          onClick={handleSummarize}
          className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-violet-50 disabled:opacity-50"
        >
          {busyAction === 'summarize' ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3 text-violet-600" />}
          요약 / 할 일
        </button>

        <button
          type="button"
          disabled={isBusy}
          onClick={() => handleDraft('reply')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-violet-50 disabled:opacity-50"
        >
          {busyAction === 'reply' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Reply className="h-3 w-3 text-violet-600" />}
          답장 초안
        </button>

        <button
          type="button"
          disabled={isBusy}
          onClick={() => handleDraft('translate')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-violet-50 disabled:opacity-50"
        >
          {busyAction === 'translate' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Languages className="h-3 w-3 text-violet-600" />}
          한국어 번역
        </button>

        <button
          type="button"
          disabled={isBusy}
          onClick={handleExtractContact}
          className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-violet-50 disabled:opacity-50"
        >
          {busyAction === 'contact' ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3 text-violet-600" />}
          서명 → 주소록
        </button>

        <button
          type="button"
          disabled={isBusy}
          onClick={handleExtractCalendar}
          className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-violet-50 disabled:opacity-50"
        >
          {busyAction === 'calendar' ? <Loader2 className="h-3 w-3 animate-spin" /> : <CalendarPlus className="h-3 w-3 text-violet-600" />}
          일정 추출
        </button>

        {canAnalyzeImage && imageCandidates.length > 0 && (
          <div className="inline-flex items-center gap-1">
            {imageCandidates.length > 1 && (
              <select
                value={selectedImageIdx}
                onChange={(e) => setSelectedImageIdx(Number(e.target.value))}
                className="rounded-lg border border-violet-200 bg-white px-2 py-1 text-xs text-slate-700"
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
              className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-violet-50 disabled:opacity-50"
            >
              {busyAction === 'image' ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImageIcon className="h-3 w-3 text-violet-600" />}
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

      {summaryResult && (
        <div className="relative rounded-xl border border-violet-200 bg-white p-4 text-xs space-y-2">
          <button
            type="button"
            onClick={() => setSummaryResult(null)}
            className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <p className="font-bold text-slate-800">메일 요약</p>
          <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{summaryResult.summary}</p>
          {summaryResult.actionItems.length > 0 && (
            <div>
              <p className="font-semibold text-violet-700 mb-1">할 일 (Action Items)</p>
              <ul className="list-disc pl-4 space-y-0.5 text-slate-600">
                {summaryResult.actionItems.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {draftResult && (
        <div className="relative rounded-xl border border-violet-200 bg-white p-4 text-xs space-y-2">
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
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Copy className="h-3 w-3" />
              복사
            </button>
            {onReplyWithDraft && (
              <button
                type="button"
                onClick={() => onReplyWithDraft(draftResult.body)}
                className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1 text-xs font-semibold text-white hover:bg-violet-500"
              >
                <Reply className="h-3 w-3" />
                답장 화면으로 이동
              </button>
            )}
          </div>
        </div>
      )}

      {contactDraft && (
        <div className="relative rounded-xl border border-violet-200 bg-white p-4 text-xs space-y-2.5">
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
              className="rounded-lg border border-slate-200 px-2.5 py-1.5"
            />
            <input
              value={contactDraft.email || ''}
              onChange={(e) => setContactDraft({ ...contactDraft, email: e.target.value })}
              placeholder="이메일"
              className="rounded-lg border border-slate-200 px-2.5 py-1.5"
            />
            <input
              value={contactDraft.company || ''}
              onChange={(e) => setContactDraft({ ...contactDraft, company: e.target.value })}
              placeholder="회사"
              className="rounded-lg border border-slate-200 px-2.5 py-1.5"
            />
            <input
              value={contactDraft.department || ''}
              onChange={(e) => setContactDraft({ ...contactDraft, department: e.target.value })}
              placeholder="부서"
              className="rounded-lg border border-slate-200 px-2.5 py-1.5"
            />
            <input
              value={contactDraft.jobTitle || ''}
              onChange={(e) => setContactDraft({ ...contactDraft, jobTitle: e.target.value })}
              placeholder="직책"
              className="rounded-lg border border-slate-200 px-2.5 py-1.5"
            />
            <input
              value={contactDraft.mobile || contactDraft.phone || ''}
              onChange={(e) => setContactDraft({ ...contactDraft, mobile: e.target.value })}
              placeholder="연락처"
              className="rounded-lg border border-slate-200 px-2.5 py-1.5"
            />
          </div>
          <button
            type="button"
            disabled={isBusy}
            onClick={handleSaveContact}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500"
          >
            <UserPlus className="h-3.5 w-3.5" />
            주소록에 저장
          </button>
        </div>
      )}

      {calendarDraft && (
        <div className="relative rounded-xl border border-violet-200 bg-white p-4 text-xs space-y-2.5">
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
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 sm:col-span-2"
            />
            <input
              value={calendarDraft.startAt}
              onChange={(e) => setCalendarDraft({ ...calendarDraft, startAt: e.target.value })}
              placeholder="시작 일시"
              className="rounded-lg border border-slate-200 px-2.5 py-1.5"
            />
            <input
              value={calendarDraft.endAt}
              onChange={(e) => setCalendarDraft({ ...calendarDraft, endAt: e.target.value })}
              placeholder="종료 일시"
              className="rounded-lg border border-slate-200 px-2.5 py-1.5"
            />
            <input
              value={calendarDraft.location || ''}
              onChange={(e) => setCalendarDraft({ ...calendarDraft, location: e.target.value })}
              placeholder="장소"
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 sm:col-span-2"
            />
          </div>
          <button
            type="button"
            disabled={isBusy}
            onClick={handleSaveCalendar}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500"
          >
            <CalendarPlus className="h-3.5 w-3.5" />
            일정에 저장
          </button>
        </div>
      )}

      {imageResult && (
        <div className="relative rounded-xl border border-violet-200 bg-white p-4 text-xs space-y-2">
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
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500"
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
