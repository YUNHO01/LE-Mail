'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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
  Clock,
  Reply,
  ReplyAll,
  Forward,
  Mail as MailIcon,
  MailCheck,
  Star,
  CalendarPlus,
  ExternalLink,
  Lock,
} from 'lucide-react';

export interface MailReadingPaneProps {
  mailId: string | null;
  standalone?: boolean;
  onRefreshList?: () => void;
  onDeleted?: (deletedId: string) => void;
  onReadChanged?: (mailId: string, isRead: boolean) => void;
  onStarChanged?: (mailId: string, isStarred: boolean) => void;
}

export const MailReadingPane: React.FC<MailReadingPaneProps> = ({
  mailId,
  standalone = false,
  onRefreshList,
  onDeleted,
  onReadChanged,
  onStarChanged,
}) => {
  const router = useRouter();
  const [mail, setMail] = useState<MailMessageDto | null>(null);
  const [spamFolderId, setSpamFolderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
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
    if (!mailId) {
      setMail(null);
      return;
    }

    let cancelled = false;
    const loadMail = async () => {
      try {
        setLoading(true);
        const data = await fetchApi<MailMessageDto>(`/mails/${mailId}`);
        if (cancelled) return;
        setMail(data);

        const folders = await fetchApi<MailFolderDto[]>('/mail-folders');
        if (cancelled) return;
        const spam = (folders || []).find((f) => f.type === FolderType.SPAM);
        if (spam) {
          setSpamFolderId(spam.id);
        }

        window.dispatchEvent(new CustomEvent('mail:refresh-folders'));
      } catch (err: any) {
        if (!cancelled) {
          if (standalone) {
            alert(err.message || '메일을 불러올 수 없습니다.');
            router.push('/mail/inbox');
          } else {
            console.error('메일 상세 조회 오류:', err);
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadMail();
    return () => {
      cancelled = true;
    };
  }, [mailId, standalone, router]);

  const handleToggleRead = async () => {
    if (!mail) return;
    const nextRead = !mail.isRead;
    try {
      await fetchApi(`/mails/${mail.id}/read`, {
        method: 'PATCH',
        body: JSON.stringify({ isRead: nextRead }),
      });
      setMail({ ...mail, isRead: nextRead });
      onReadChanged?.(mail.id, nextRead);
      window.dispatchEvent(new CustomEvent('mail:refresh-folders'));
    } catch (err: any) {
      alert(err.message || '읽음 상태 변경 실패');
    }
  };

  const handleToggleStar = async () => {
    if (!mail) return;
    const nextStarred = !mail.isStarred;
    try {
      await fetchApi(`/mails/${mail.id}/star`, {
        method: 'PATCH',
        body: JSON.stringify({ isStarred: nextStarred }),
      });
      setMail({ ...mail, isStarred: nextStarred });
      onStarChanged?.(mail.id, nextStarred);
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
        `/mails/${mail.id}/report-spam`,
        { method: 'POST' },
      );
      alert(res.message || '스팸 신고 처리되었습니다.');
      window.dispatchEvent(new CustomEvent('mail:refresh-folders'));
      if (standalone) {
        router.push('/mail/inbox');
      } else {
        onDeleted?.(mail.id);
        onRefreshList?.();
      }
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
        `/mails/${mail.id}/unreport-spam`,
        { method: 'POST' },
      );
      alert(res.message || '받은편지함으로 복원되었습니다.');
      window.dispatchEvent(new CustomEvent('mail:refresh-folders'));
      if (standalone) {
        router.push('/mail/inbox');
      } else {
        onDeleted?.(mail.id);
        onRefreshList?.();
      }
    } catch (err: any) {
      alert(err.message || '스팸 해제 실패');
    }
  };

  const handleDelete = async () => {
    if (!mail) return;
    if (!confirm('이 메일을 정말 삭제하시겠습니까?')) return;
    try {
      await fetchApi(`/mails/${mail.id}`, { method: 'DELETE' });
      window.dispatchEvent(new CustomEvent('mail:refresh-folders'));
      if (standalone) {
        router.push('/mail/inbox');
      } else {
        onDeleted?.(mail.id);
        onRefreshList?.();
      }
    } catch (err: any) {
      alert(err.message || '삭제 실패');
    }
  };

  if (!mailId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-white text-[#86868b] p-8 select-none">
        <div className="w-16 h-16 rounded-2xl bg-[#f5f5f7] flex items-center justify-center mb-3">
          <MailIcon className="h-8 w-8 text-[#c7c7cc] stroke-[1.5]" />
        </div>
        <p className="text-[14px] font-medium text-[#6e6e73]">선택된 메일이 없습니다</p>
        <p className="text-[12px] text-[#86868b] mt-1">목록에서 메일을 선택하면 이곳에 본문이 표시됩니다.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-white text-[#86868b] p-8">
        <div className="w-6 h-6 rounded-full border-2 border-[#0071e3]/20 border-t-[#0071e3] animate-spin mb-3" />
        <p className="text-xs font-medium">메일을 불러오는 중...</p>
      </div>
    );
  }

  if (!mail) return null;

  const senderInitial = mail.sender ? mail.sender.replace(/["'<]/g, '').trim().slice(0, 1).toUpperCase() : 'M';

  return (
    <div className={`flex-1 flex flex-col min-h-0 bg-white ${standalone ? 'rounded-2xl border border-black/[0.08] overflow-hidden' : ''}`}>
      {/* iCloud Style Sticky Action Toolbar */}
      <div className="h-12 shrink-0 px-4 sm:px-6 border-b border-black/[0.06] flex items-center justify-between gap-2 bg-white/95 backdrop-blur-md">
        <div className="flex items-center gap-1 flex-wrap">
          {standalone && (
            <>
              <button
                onClick={() => router.push('/mail/inbox')}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#1d1d1f] hover:bg-black/[0.05] transition"
              >
                <ArrowLeft className="h-3.5 w-3.5 text-[#0071e3]" />
                <span>목록</span>
              </button>
              <div className="h-4 w-px bg-black/[0.08] mx-1" />
            </>
          )}

          <button
            onClick={() => router.push(`/mail/compose?mode=reply&replyId=${mail.id}`)}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#1d1d1f] hover:bg-black/[0.05] transition"
            title="답장"
          >
            <Reply className="h-3.5 w-3.5 text-[#0071e3]" />
            <span>답장</span>
          </button>

          <button
            onClick={() => router.push(`/mail/compose?mode=replyAll&replyId=${mail.id}`)}
            className="p-1.5 rounded-lg text-[#6e6e73] hover:bg-black/[0.05] hover:text-[#1d1d1f] transition"
            title="전체 답장"
          >
            <ReplyAll className="h-4 w-4" />
          </button>

          <button
            onClick={() => router.push(`/mail/compose?mode=forward&replyId=${mail.id}`)}
            className="p-1.5 rounded-lg text-[#6e6e73] hover:bg-black/[0.05] hover:text-[#1d1d1f] transition"
            title="전달"
          >
            <Forward className="h-4 w-4" />
          </button>

          <div className="h-4 w-px bg-black/[0.08] mx-1" />

          <button
            onClick={handleToggleRead}
            className="p-1.5 rounded-lg text-[#6e6e73] hover:bg-black/[0.05] hover:text-[#0071e3] transition"
            title={mail.isRead ? '안읽음으로 표시' : '읽음으로 표시'}
          >
            {mail.isRead ? <MailIcon className="h-4 w-4" /> : <MailCheck className="h-4 w-4 text-[#0071e3]" />}
          </button>

          {spamFolderId && mail.folderId === spamFolderId ? (
            <button
              onClick={handleUnreportSpam}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-[#248a3d] bg-[#34c759]/10 hover:bg-[#34c759]/20 transition"
              title="받은편지함으로 복원 및 발신자 수신 허용"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">스팸 해제</span>
            </button>
          ) : (
            <button
              onClick={handleReportSpam}
              className="p-1.5 rounded-lg text-[#6e6e73] hover:bg-[#ff9500]/10 hover:text-[#ff9500] transition"
              title="스팸 신고"
            >
              <ShieldAlert className="h-4 w-4" />
            </button>
          )}

          <button
            onClick={handleDelete}
            className="p-1.5 rounded-lg text-[#6e6e73] hover:bg-[#ff3b30]/10 hover:text-[#ff3b30] transition"
            title="삭제"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleOpenCreateCalendarEvent}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#6e6e73] hover:bg-black/[0.05] hover:text-[#1d1d1f] transition"
            title="캘린더 일정 등록"
          >
            <CalendarPlus className="h-3.5 w-3.5 text-[#0071e3]" />
            <span className="hidden md:inline">일정 등록</span>
          </button>

          <a
            href={`/api/mails/${mail.id}/raw`}
            target="_blank"
            rel="noreferrer"
            className="p-1.5 rounded-lg text-[#6e6e73] hover:bg-black/[0.05] hover:text-[#1d1d1f] transition"
            title="원본 EML 다운로드"
          >
            <Download className="h-4 w-4" />
          </a>

          {!standalone && (
            <button
              onClick={() => router.push(`/mail/${mail.id}`)}
              className="p-1.5 rounded-lg text-[#6e6e73] hover:bg-black/[0.05] hover:text-[#1d1d1f] transition"
              title="전체 화면으로 보기"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Reading Area */}
      <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-6">
        <div className="max-w-4xl">
          {/* Subject & Badges */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <button
                type="button"
                onClick={handleToggleStar}
                title={mail.isStarred ? '중요 메일 해제' : '중요 메일 표시'}
                className="mt-0.5 p-1 rounded-lg hover:bg-[#ff9500]/10 transition shrink-0"
              >
                <Star
                  className={`h-4.5 w-4.5 ${
                    mail.isStarred
                      ? 'fill-[#ff9500] text-[#ff9500]'
                      : 'text-[#d2d2d7] hover:text-[#ff9500]'
                  }`}
                />
              </button>
              <h1 className="text-[20px] font-semibold tracking-tight text-[#1d1d1f] leading-snug break-words">
                {mail.subject || '(제목 없음)'}
              </h1>
            </div>
            {mail.isSecure && (
              <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#34c759]/12 text-[#248a3d] text-[11px] font-medium">
                <Lock className="h-3 w-3" />
                보안메일
              </span>
            )}
          </div>

          {/* Sender Metadata */}
          <div className="mt-5 pb-5 border-b border-black/[0.06] flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-[#0071e3]/12 text-[#0071e3] font-semibold text-sm flex items-center justify-center shrink-0">
                {senderInitial}
              </div>
              <div className="text-[13px] min-w-0">
                <div className="font-semibold text-[#1d1d1f] truncate">{mail.sender}</div>
                <div className="text-[12px] text-[#6e6e73] mt-0.5 break-all">
                  받는사람:{' '}
                  {mail.recipients && mail.recipients.length > 0
                    ? mail.recipients.map((r) => r.address).join(', ')
                    : '지정되지 않음'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-[12px] text-[#86868b] tabular-nums shrink-0">
              <Clock className="h-3.5 w-3.5" />
              <span>{new Date(mail.createdAt).toLocaleString('ko-KR')}</span>
            </div>
          </div>

          {/* Security Verification Badges (Compact) */}
          {(mail.spfResult || mail.dkimResult || mail.dmarcResult) && (
            <div className="flex flex-wrap items-center gap-1.5 py-2.5 border-b border-black/[0.06] text-[11px]">
              <span className="text-[#86868b] font-medium mr-1">보안 인증:</span>
              {[
                { label: 'SPF', val: mail.spfResult },
                { label: 'DKIM', val: mail.dkimResult },
                { label: 'DMARC', val: mail.dmarcResult },
              ].map(({ label, val }) => {
                const res = val || 'NONE';
                let badgeColor = 'bg-black/[0.04] text-[#6e6e73]';
                if (res === 'PASS') {
                  badgeColor = 'bg-[#34c759]/12 text-[#248a3d] font-medium';
                } else if (res === 'FAIL') {
                  badgeColor = 'bg-[#ff3b30]/12 text-[#ff3b30] font-medium';
                } else if (res === 'SOFTFAIL' || res === 'NEUTRAL') {
                  badgeColor = 'bg-[#ff9500]/12 text-[#b25000]';
                }
                return (
                  <span key={label} className={`rounded-full px-2 py-0.5 ${badgeColor}`}>
                    {label}: {res}
                  </span>
                );
              })}
            </div>
          )}

          {/* Attachments */}
          {mail.attachments && mail.attachments.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {mail.attachments.map((att) => (
                <a
                  key={att.id}
                  href={`/api/mails/${mail.id}/attachments/${att.id}`}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#f5f5f7] hover:bg-black/[0.06] border border-black/[0.06] px-3 py-1.5 text-xs font-medium text-[#1d1d1f] transition"
                >
                  <FileText className="h-3.5 w-3.5 text-[#0071e3]" />
                  <span>{att.filename}</span>
                  <span className="text-[11px] text-[#86868b]">({att.sizeBytes} B)</span>
                  <Download className="h-3 w-3 text-[#86868b]" />
                </a>
              ))}
            </div>
          )}

          {/* Body */}
          <div className="mt-6">
            {mail.body?.html ? (
              <div
                className="prose prose-sm max-w-none text-[14px] leading-relaxed text-[#1d1d1f]"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(mail.body.html) }}
              />
            ) : mail.body?.text ? (
              <pre className="whitespace-pre-wrap font-sans text-[14px] leading-relaxed text-[#1d1d1f]">
                {mail.body.text}
              </pre>
            ) : (
              <p className="text-sm italic text-[#86868b]">본문 내용이 없습니다.</p>
            )}
          </div>
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
};
