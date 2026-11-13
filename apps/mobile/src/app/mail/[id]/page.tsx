'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { fetchApi, calendarApi } from '@/lib/api';
import { sanitizeHtml } from '@/lib/sanitize';
import {
  MailMessageDto,
  MailFolderDto,
  FolderType,
  CalendarDto,
  CreateCalendarEventDto,
  UpdateCalendarEventDto,
} from '@lemail/shared-types';
import { EventModal } from '@/components/calendar/EventModal';
import {
  ArrowLeft,
  Download,
  Paperclip,
  Trash2,
  ShieldCheck,
  ShieldAlert,
  FileText,
  User,
  Clock,
  Reply,
  ReplyAll,
  Forward,
  Mail as MailIcon,
  MailCheck,
  Star,
  CalendarPlus,
} from 'lucide-react';

export default function MailDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [mail, setMail] = useState<MailMessageDto | null>(null);
  const [spamFolderId, setSpamFolderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [calendars, setCalendars] = useState<CalendarDto[]>([]);
  const [calendarModalOpen, setCalendarModalOpen] = useState(false);

  const handleOpenCreateCalendarEvent = async () => {
    try {
      if (calendars.length === 0) {
        const cals = await calendarApi.getCalendars();
        setCalendars(cals || []);
      }
      setCalendarModalOpen(true);
    } catch (err: any) {
      alert(err?.message || '캘린더 목록을 불러오지 못했습니다.');
    }
  };

  const handleSaveCalendarEvent = async (
    payload: CreateCalendarEventDto | UpdateCalendarEventDto,
  ) => {
    await calendarApi.createEvent(payload as CreateCalendarEventDto);
    alert('캘린더에 일정이 등록되었습니다.');
  };

  useEffect(() => {
    if (!id) return;
    const loadMail = async () => {
      try {
        setLoading(true);
        const data = await fetchApi<MailMessageDto>(`/mails/${id}`);
        setMail(data);

        // 폴더 목록 조회하여 SPAM 폴더 ID 식별
        const folders = await fetchApi<MailFolderDto[]>('/mail-folders');
        const spam = (folders || []).find((f) => f.type === FolderType.SPAM);
        if (spam) {
          setSpamFolderId(spam.id);
        }

        // 상세 열람 시 백엔드에서 읽음 처리되었으므로 폴더 카운트 동기화
        window.dispatchEvent(new CustomEvent('mail:refresh-folders'));
      } catch (err: any) {
        alert(err.message || '메일을 불러올 수 없습니다.');
        router.push('/mail/inbox');
      } finally {
        setLoading(false);
      }
    };
    loadMail();
  }, [id, router]);

  const handleToggleRead = async () => {
    if (!mail) return;
    const nextRead = !mail.isRead;
    try {
      await fetchApi(`/mails/${id}/read`, {
        method: 'PATCH',
        body: JSON.stringify({ isRead: nextRead }),
      });
      setMail({ ...mail, isRead: nextRead });
      window.dispatchEvent(new CustomEvent('mail:refresh-folders'));
    } catch (err: any) {
      alert(err.message || '읽음 상태 변경 실패');
    }
  };

  const handleToggleStar = async () => {
    if (!mail) return;
    const nextStarred = !mail.isStarred;
    try {
      await fetchApi(`/mails/${id}/star`, {
        method: 'PATCH',
        body: JSON.stringify({ isStarred: nextStarred }),
      });
      setMail({ ...mail, isStarred: nextStarred });
    } catch (err: any) {
      alert(err.message || '중요 표시 변경 실패');
    }
  };

  const handleReportSpam = async () => {
    if (!mail) return;
    if (
      !confirm(
        '이 메일을 스팸으로 신고하시겠습니까?\n발신자가 차단 목록에 등록되며 메일이 스팸메일함으로 이동합니다.',
      )
    )
      return;
    try {
      const res = await fetchApi<{ success: boolean; message: string }>(
        `/mails/${id}/report-spam`,
        { method: 'POST' },
      );
      alert(res.message || '스팸 신고 처리되었습니다.');
      window.dispatchEvent(new CustomEvent('mail:refresh-folders'));
      router.push('/mail/inbox');
    } catch (err: any) {
      alert(err.message || '스팸 신고 실패');
    }
  };

  const handleUnreportSpam = async () => {
    if (!mail) return;
    if (
      !confirm(
        '이 메일을 스팸 해제하고 받은편지함으로 복원하시겠습니까?\n발신자가 수신 허용 목록에 등록됩니다.',
      )
    )
      return;
    try {
      const res = await fetchApi<{ success: boolean; message: string }>(
        `/mails/${id}/unreport-spam`,
        { method: 'POST' },
      );
      alert(res.message || '받은편지함으로 복원되었습니다.');
      window.dispatchEvent(new CustomEvent('mail:refresh-folders'));
      router.push('/mail/inbox');
    } catch (err: any) {
      alert(err.message || '스팸 해제 실패');
    }
  };

  const handleDelete = async () => {
    if (!confirm('이 메일을 정말 삭제하시겠습니까?')) return;
    try {
      await fetchApi(`/mails/${id}`, { method: 'DELETE' });
      window.dispatchEvent(new CustomEvent('mail:refresh-folders'));
      router.push('/mail/inbox');
    } catch (err: any) {
      alert(err.message || '삭제 실패');
    }
  };

  if (loading) {
    return (
      <div className="py-20 text-center text-slate-400">
        <p>메일을 불러오는 중...</p>
      </div>
    );
  }

  if (!mail) return null;

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <button
          onClick={() => router.push('/mail/inbox')}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 transition"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>목록으로 돌아가기</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push(`/mail/compose?mode=reply&replyId=${mail.id}`)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
          >
            <Reply className="h-3.5 w-3.5 text-slate-500" />
            <span>답장</span>
          </button>

          <button
            onClick={() => router.push(`/mail/compose?mode=replyAll&replyId=${mail.id}`)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
          >
            <ReplyAll className="h-3.5 w-3.5 text-slate-500" />
            <span>전체답장</span>
          </button>

          <button
            onClick={() => router.push(`/mail/compose?mode=forward&replyId=${mail.id}`)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
          >
            <Forward className="h-3.5 w-3.5 text-slate-500" />
            <span>전달</span>
          </button>

          <button
            onClick={handleOpenCreateCalendarEvent}
            className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 shadow-sm hover:bg-violet-100 transition"
          >
            <CalendarPlus className="h-3.5 w-3.5 text-violet-600" />
            <span>일정 등록</span>
          </button>

          <div className="h-4 w-px bg-slate-200 mx-1" />

          <button
            onClick={handleToggleRead}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold shadow-sm transition ${
              mail.isRead
                ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                : 'border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100'
            }`}
          >
            {mail.isRead ? (
              <>
                <MailIcon className="h-3.5 w-3.5 text-slate-500" />
                <span>안읽음으로 표시</span>
              </>
            ) : (
              <>
                <MailCheck className="h-3.5 w-3.5 text-sky-600" />
                <span>읽음으로 표시</span>
              </>
            )}
          </button>

          <a
            href={`/api/mails/${mail.id}/raw`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
            <span>원본 EML</span>
          </a>

          {/* 스팸 신고 또는 정상 메일 복원 버튼 */}
          {spamFolderId && mail.folderId === spamFolderId ? (
            <button
              onClick={handleUnreportSpam}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 shadow-sm hover:bg-emerald-100 transition"
              title="받은편지함으로 복원 및 발신자 수신 허용"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              <span>정상 메일 복원</span>
            </button>
          ) : (
            <button
              onClick={handleReportSpam}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 shadow-sm hover:bg-amber-100 transition"
              title="스팸 편지함으로 이동 및 발신자 차단"
            >
              <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
              <span>스팸 신고</span>
            </button>
          )}

          <button
            onClick={handleDelete}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>삭제</span>
          </button>
        </div>
      </div>

      {/* Main Mail Container */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {/* Header Info */}
        <div className="border-b border-slate-100 bg-slate-50/50 p-6 space-y-4">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleToggleStar}
              title={mail.isStarred ? '중요 메일 해제' : '중요 메일 표시'}
              className="p-1 rounded-lg hover:bg-amber-50 transition shrink-0"
            >
              <Star
                className={`h-5 w-5 ${
                  mail.isStarred
                    ? 'fill-amber-400 text-amber-400'
                    : 'text-slate-300 hover:text-amber-400'
                }`}
              />
            </button>
            <h1 className="text-xl font-bold text-slate-900">
              {mail.subject || '(제목 없음)'}
            </h1>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-slate-500">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-700">보낸사람:</span>
                <span className="font-medium text-slate-900">{mail.sender}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-700">받는사람:</span>
                <span className="text-slate-700">
                  {mail.recipients && mail.recipients.length > 0
                    ? mail.recipients.map((r) => r.address).join(', ')
                    : '지정되지 않음'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:self-start">
              <Clock className="h-3.5 w-3.5 text-slate-400" />
              <span>{new Date(mail.createdAt).toLocaleString()}</span>
            </div>
          </div>

          {/* Security Verification Badges */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/60 text-[11px]">
            <span className="text-slate-500 font-semibold">보안 인증:</span>
            {[
              { label: 'SPF', val: mail.spfResult },
              { label: 'DKIM', val: mail.dkimResult },
              { label: 'DMARC', val: mail.dmarcResult },
            ].map(({ label, val }) => {
              const res = val || 'NONE';
              let badgeColor = 'bg-slate-100 text-slate-600 border-slate-200';
              if (res === 'PASS') {
                badgeColor =
                  'bg-emerald-50 text-emerald-700 border-emerald-300 font-semibold';
              } else if (res === 'FAIL') {
                badgeColor =
                  'bg-rose-50 text-rose-700 border-rose-300 font-semibold';
              } else if (res === 'SOFTFAIL' || res === 'NEUTRAL') {
                badgeColor = 'bg-amber-50 text-amber-700 border-amber-300';
              }
              return (
                <span
                  key={label}
                  className={`rounded border px-2 py-0.5 text-[11px] ${badgeColor}`}
                >
                  {label}: {res}
                </span>
              );
            })}
          </div>
        </div>

        {/* Attachments Section if any */}
        {mail.attachments && mail.attachments.length > 0 && (
          <div className="border-b border-slate-100 bg-sky-50/30 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 mb-2">
              <Paperclip className="h-4 w-4 text-sky-600" />
              <span>첨부파일 ({mail.attachments.length}개)</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {mail.attachments.map((att) => (
                <a
                  key={att.id}
                  href={`/api/mails/${mail.id}/attachments/${att.id}`}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 shadow-sm hover:border-sky-300 hover:bg-sky-50 transition"
                >
                  <FileText className="h-4 w-4 text-sky-500" />
                  <span>{att.filename}</span>
                  <span className="text-[11px] text-slate-400">({att.sizeBytes} B)</span>
                  <Download className="h-3 w-3 text-slate-400 ml-1" />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Mail Body */}
        <div className="p-6">
          {mail.body?.html ? (
            <div
              className="prose max-w-none text-sm text-slate-800"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(mail.body.html) }}
            />
          ) : mail.body?.text ? (
            <pre className="whitespace-pre-wrap font-sans text-sm text-slate-800">
              {mail.body.text}
            </pre>
          ) : (
            <p className="text-sm italic text-slate-400">본문 내용이 없습니다.</p>
          )}
        </div>

        {/* Bottom Quick Action Footer */}
        <div className="flex items-center gap-3 border-t border-slate-100 bg-slate-50/50 px-6 py-4">
          <button
            onClick={() => router.push(`/mail/compose?mode=reply&replyId=${mail.id}`)}
            className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 hover:text-slate-900 transition"
          >
            <Reply className="h-4 w-4 text-slate-500" />
            <span>답장</span>
          </button>
          <button
            onClick={() => router.push(`/mail/compose?mode=forward&replyId=${mail.id}`)}
            className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 hover:text-slate-900 transition"
          >
            <Forward className="h-4 w-4 text-slate-500" />
            <span>전달</span>
          </button>
        </div>
      </div>

      <EventModal
        isOpen={calendarModalOpen}
        onClose={() => setCalendarModalOpen(false)}
        calendars={calendars}
        initialDraft={{
          title: mail.subject || '(제목 없음)',
          description: `보낸사람: ${mail.sender}\n수신일시: ${new Date(mail.createdAt).toLocaleString('ko-KR')}\n\n${mail.body?.text || ''}`.slice(0, 2000),
          sourceMailId: mail.id,
          attendees: mail.sender?.includes('@')
            ? [{ email: mail.sender.replace(/.*<([^>]+)>.*/, '$1').trim() }]
            : [],
        }}
        onSave={handleSaveCalendarEvent}
      />
    </div>
  );
}
