'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { fetchApi, calendarApi, contactsApi } from '@/lib/api';
import { SandboxedMailBody } from '@/components/mail/SandboxedMailBody';
import {
  MailMessageDto,
  MailFolderDto,
  FolderType,
  CalendarDto,
  CreateCalendarEventDto,
  UpdateCalendarEventDto,
  ContactEmailStatusDto,
  ContactGroupDto,
} from '@lemail/shared-types';
import { EventModal } from '@/components/calendar/EventModal';
import { ContactModal } from '@/components/contacts/ContactModal';
import { MailAiAssistantPanel } from '@/components/ai/MailAiAssistantPanel';
import { ToastBanner, useToast, formatFileSize } from '@/components/common/ToastBanner';
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
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Layers,
  AlertTriangle,
  ChevronsUpDown,
  UserPlus,
} from 'lucide-react';

const MAX_MULTI_OPEN_COUNT = 5;

function MailMultiViewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawIdsParam = searchParams.get('ids') || '';

  const { targetIds, truncatedCount } = useMemo(() => {
    const parsed = Array.from(
      new Set(
        rawIdsParam
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    );
    return {
      targetIds: parsed.slice(0, MAX_MULTI_OPEN_COUNT),
      truncatedCount: Math.max(0, parsed.length - MAX_MULTI_OPEN_COUNT),
    };
  }, [rawIdsParam]);

  const [mails, setMails] = useState<MailMessageDto[]>([]);
  const [failedCount, setFailedCount] = useState(0);
  const [spamFolderId, setSpamFolderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const { toast, showToast } = useToast();

  const [calendars, setCalendars] = useState<CalendarDto[]>([]);
  const [calendarTargetMail, setCalendarTargetMail] = useState<MailMessageDto | null>(null);

  const [emailStatuses, setEmailStatuses] = useState<Record<string, ContactEmailStatusDto>>({});
  const [contactGroups, setContactGroups] = useState<ContactGroupDto[]>([]);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactInitialValues, setContactInitialValues] = useState<{
    name?: string;
    email?: string;
  } | null>(null);

  const extractEmail = (raw?: string | null): string => {
    if (!raw) return '';
    const match = raw.match(/<([^>]+)>/);
    return (match ? match[1] : raw).trim().toLowerCase();
  };

  const canAddExternalContact = (raw?: string | null): boolean => {
    const email = extractEmail(raw);
    if (!email || !email.includes('@')) return false;
    const status = emailStatuses[email];
    return Boolean(status && !status.inContacts && !status.isCompanyUser && !status.isSelf);
  };

  const handleOpenAddContact = async (
    e: React.MouseEvent,
    name?: string | null,
    rawEmail?: string | null,
  ) => {
    e.stopPropagation();
    const email = extractEmail(rawEmail);
    if (!email) return;
    const cleanedName = (name || '').replace(/["'<>]/g, '').trim();
    const fallbackName =
      cleanedName && cleanedName.toLowerCase() !== email ? cleanedName : email.split('@')[0];
    setContactInitialValues({ name: fallbackName, email });
    try {
      if (contactGroups.length === 0) {
        const groups = await contactsApi.getGroups().catch(() => [] as ContactGroupDto[]);
        setContactGroups(groups || []);
      }
    } finally {
      setContactModalOpen(true);
    }
  };

  const handleContactSaved = () => {
    const savedEmail = extractEmail(contactInitialValues?.email);
    if (savedEmail) {
      setEmailStatuses((prev) => ({
        ...prev,
        [savedEmail]: {
          email: savedEmail,
          inContacts: true,
          isCompanyUser: prev[savedEmail]?.isCompanyUser ?? false,
          isSelf: prev[savedEmail]?.isSelf ?? false,
          contactId: prev[savedEmail]?.contactId ?? null,
        },
      }));
    }
    setContactModalOpen(false);
  };

  useEffect(() => {
    if (targetIds.length === 0) {
      setMails([]);
      setFailedCount(0);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const loadMails = async () => {
      try {
        setLoading(true);
        const [mailResults, folders] = await Promise.all([
          Promise.allSettled(
            targetIds.map((id) => fetchApi<MailMessageDto>(`/mails/${id}`)),
          ),
          fetchApi<MailFolderDto[]>('/mail-folders').catch(() => [] as MailFolderDto[]),
        ]);

        if (cancelled) return;

        const loaded: MailMessageDto[] = [];
        let failures = 0;
        for (const result of mailResults) {
          if (result.status === 'fulfilled' && result.value) {
            loaded.push(result.value);
          } else {
            failures += 1;
          }
        }

        setMails(loaded);
        setFailedCount(failures);

        const candidateEmails = Array.from(
          new Set(
            loaded
              .flatMap((m) => [
                extractEmail(m.sender),
                ...(m.recipients || []).map((r) => extractEmail(r.address)),
              ])
              .filter((e) => e && e.includes('@')),
          ),
        );
        if (candidateEmails.length > 0) {
          contactsApi
            .checkEmails(candidateEmails)
            .then((res) => {
              if (!cancelled && res?.statuses) {
                setEmailStatuses(res.statuses);
              }
            })
            .catch(() => {
              if (!cancelled) setEmailStatuses({});
            });
        } else {
          setEmailStatuses({});
        }

        const initialExpanded: Record<string, boolean> = {};
        for (const m of loaded) {
          initialExpanded[m.id] = true;
        }
        setExpandedIds(initialExpanded);

        const spam = (folders || []).find((f) => f.type === FolderType.SPAM);
        if (spam) {
          setSpamFolderId(spam.id);
        }

        window.dispatchEvent(new CustomEvent('mail:refresh-folders'));
      } catch (err) {
        console.error('다중 메일 조회 오류:', err);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadMails();
    return () => {
      cancelled = true;
    };
  }, [targetIds]);

  const handleGoBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/mail/inbox');
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const allExpanded = mails.length > 0 && mails.every((m) => !!expandedIds[m.id]);

  const handleToggleAllExpand = () => {
    const nextState = !allExpanded;
    const nextMap: Record<string, boolean> = {};
    for (const m of mails) {
      nextMap[m.id] = nextState;
    }
    setExpandedIds(nextMap);
  };

  const handleJumpToCard = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: true }));
    const el = document.getElementById(`mail-card-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const removeMailFromView = (id: string) => {
    setMails((prev) => {
      const remaining = prev.filter((m) => m.id !== id);
      if (remaining.length === 0) {
        router.push('/mail/inbox');
      }
      return remaining;
    });
  };

  const handleToggleRead = async (mail: MailMessageDto) => {
    const nextRead = !mail.isRead;
    try {
      await fetchApi(`/mails/${mail.id}/read`, {
        method: 'PATCH',
        body: JSON.stringify({ isRead: nextRead }),
      });
      setMails((prev) =>
        prev.map((m) => (m.id === mail.id ? { ...m, isRead: nextRead } : m)),
      );
      window.dispatchEvent(new CustomEvent('mail:refresh-folders'));
    } catch (err: any) {
      showToast(err.message || '읽음 상태 변경 실패', 'error');
    }
  };

  const handleToggleStar = async (e: React.MouseEvent, mail: MailMessageDto) => {
    e.stopPropagation();
    const nextStarred = !mail.isStarred;
    try {
      await fetchApi(`/mails/${mail.id}/star`, {
        method: 'PATCH',
        body: JSON.stringify({ isStarred: nextStarred }),
      });
      setMails((prev) =>
        prev.map((m) => (m.id === mail.id ? { ...m, isStarred: nextStarred } : m)),
      );
    } catch (err: any) {
      showToast(err.message || '중요 표시 변경 실패', 'error');
    }
  };

  const handleReportSpam = async (mail: MailMessageDto) => {
    if (
      !confirm(
        '이 메일을 스팸으로 신고하시겠습니까?\n발신자가 차단 목록에 등록되며 메일이 스팸메일함으로 이동합니다.',
      )
    ) {
      return;
    }
    try {
      const res = await fetchApi<{ success: boolean; message: string }>(
        `/mails/${mail.id}/report-spam`,
        { method: 'POST' },
      );
      showToast(res.message || '스팸 신고 처리되었습니다.');
      window.dispatchEvent(new CustomEvent('mail:refresh-folders'));
      removeMailFromView(mail.id);
    } catch (err: any) {
      showToast(err.message || '스팸 신고 실패', 'error');
    }
  };

  const handleUnreportSpam = async (mail: MailMessageDto) => {
    if (
      !confirm(
        '이 메일을 스팸 해제하고 받은편지함으로 복원하시겠습니까?\n발신자가 수신 허용 목록에 등록됩니다.',
      )
    ) {
      return;
    }
    try {
      const res = await fetchApi<{ success: boolean; message: string }>(
        `/mails/${mail.id}/unreport-spam`,
        { method: 'POST' },
      );
      showToast(res.message || '받은편지함으로 복원되었습니다.');
      window.dispatchEvent(new CustomEvent('mail:refresh-folders'));
      removeMailFromView(mail.id);
    } catch (err: any) {
      showToast(err.message || '스팸 해제 실패', 'error');
    }
  };

  const handleDelete = async (mail: MailMessageDto) => {
    if (!confirm('이 메일을 정말 삭제하시겠습니까?')) return;
    try {
      await fetchApi(`/mails/${mail.id}`, { method: 'DELETE' });
      window.dispatchEvent(new CustomEvent('mail:refresh-folders'));
      removeMailFromView(mail.id);
    } catch (err: any) {
      showToast(err.message || '삭제 실패', 'error');
    }
  };

  const handleOpenCreateCalendarEvent = async (mail: MailMessageDto) => {
    try {
      if (calendars.length === 0) {
        const cals = await calendarApi.getCalendars();
        setCalendars(cals || []);
      }
      setCalendarTargetMail(mail);
    } catch (err: any) {
      showToast(err?.message || '캘린더 목록을 불러오지 못했습니다.', 'error');
    }
  };

  const handleSaveCalendarEvent = async (
    payload: CreateCalendarEventDto | UpdateCalendarEventDto,
  ) => {
    await calendarApi.createEvent(payload as CreateCalendarEventDto);
    showToast('캘린더에 일정이 등록되었습니다.');
  };

  if (loading) {
    return (
      <div className="py-20 text-center text-[#86868b]">
        <p className="text-xs font-medium">선택한 메일을 불러오는 중...</p>
      </div>
    );
  }

  if (targetIds.length === 0 || mails.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-black/[0.08] bg-white py-16 px-6 text-center shadow-xs">
        <Layers className="h-10 w-10 text-[#c7c7cc] mb-3" />
        <h2 className="text-lg font-bold text-[#1d1d1f]">열람할 메일이 없습니다</h2>
        <p className="mt-1 text-sm text-[#6e6e73]">
          {failedCount > 0
            ? '선택한 메일을 불러오지 못했습니다.'
            : '편지함에서 열람할 메일을 선택해 주세요. (최대 5건)'}
        </p>
        <button
          type="button"
          onClick={handleGoBack}
          className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-[#0071e3] px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-[#0062c4] transition"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>목록으로 돌아가기</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Top Bar */}
      <div className="flex flex-col gap-3 border-b border-black/[0.08] pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleGoBack}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#6e6e73] hover:text-[#1d1d1f] transition"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>목록으로 돌아가기</span>
          </button>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#0071e3]/20 bg-[#0071e3]/10 px-2.5 py-1 text-xs font-semibold text-[#0071e3]">
            <Layers className="h-3.5 w-3.5" />
            <span>동시 열람 {mails.length}건</span>
          </span>
        </div>

        <button
          type="button"
          onClick={handleToggleAllExpand}
          className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-lg border border-black/[0.08] bg-white px-3 py-1.5 text-xs font-semibold text-[#1d1d1f] shadow-xs hover:bg-black/[0.03] transition"
        >
          <ChevronsUpDown className="h-3.5 w-3.5 text-[#6e6e73]" />
          <span>{allExpanded ? '모두 접기' : '모두 펼치기'}</span>
        </button>
      </div>

      {/* Limit / Error Notices */}
      {(truncatedCount > 0 || failedCount > 0) && (
        <div className="flex flex-col gap-2">
          {truncatedCount > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-800">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
              <span>
                동시 열람은 최대 {MAX_MULTI_OPEN_COUNT}건까지 지원되어 앞의{' '}
                {MAX_MULTI_OPEN_COUNT}건만 표시합니다. (제외됨: {truncatedCount}건)
              </span>
            </div>
          )}
          {failedCount > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-medium text-rose-700">
              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
              <span>선택한 메일 중 {failedCount}건을 불러오지 못했습니다.</span>
            </div>
          )}
        </div>
      )}

      {/* Quick Jump Navigation */}
      {mails.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-black/[0.08] bg-white p-3">
          <span className="text-[11px] font-semibold text-[#6e6e73] mr-1">
            빠른 이동:
          </span>
          {mails.map((m, idx) => (
            <button
              key={m.id}
              type="button"
              onClick={() => handleJumpToCard(m.id)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-[#f5f5f7] px-2.5 py-1 text-xs text-[#1d1d1f] hover:border-[#0071e3]/40 hover:bg-[#0071e3]/8 hover:text-[#0071e3] transition max-w-[240px]"
              title={m.subject || '(제목 없음)'}
            >
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#0071e3]/15 text-[10px] font-bold text-[#0071e3] shrink-0">
                {idx + 1}
              </span>
              <span className="truncate font-medium">
                {m.subject || '(제목 없음)'}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Stacked Mail Cards */}
      <div className="space-y-5">
        {mails.map((mail, idx) => {
          const isExpanded = !!expandedIds[mail.id];
          return (
            <article
              key={mail.id}
              id={`mail-card-${mail.id}`}
              className="rounded-2xl border border-black/[0.08] bg-white shadow-xs overflow-hidden scroll-mt-4"
            >
              {/* Accordion Header */}
              <div
                onClick={() => toggleExpand(mail.id)}
                className="flex flex-col gap-2 border-b border-black/[0.06] bg-[#f5f5f7]/60 px-6 py-4 cursor-pointer hover:bg-[#f5f5f7] transition sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start sm:items-center gap-2.5 min-w-0">
                  <span className="inline-flex h-6 px-2 items-center justify-center rounded-md bg-[#0071e3]/12 text-xs font-bold text-[#0071e3] shrink-0">
                    {idx + 1}/{mails.length}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => handleToggleStar(e, mail)}
                    title={mail.isStarred ? '중요 메일 해제' : '중요 메일 표시'}
                    aria-label={mail.isStarred ? '중요 메일 해제' : '중요 메일 표시'}
                    className="p-1 rounded-lg hover:bg-[#ff9500]/10 transition shrink-0"
                  >
                    <Star
                      className={`h-4 w-4 ${
                        mail.isStarred
                          ? 'fill-[#ff9500] text-[#ff9500]'
                          : 'text-[#d2d2d7] hover:text-[#ff9500]'
                      }`}
                    />
                  </button>
                  <div className="min-w-0">
                    <h2 className="text-base font-bold text-[#1d1d1f] truncate">
                      {mail.subject || '(제목 없음)'}
                    </h2>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[#6e6e73]">
                      <span className="inline-flex items-center gap-1.5 min-w-0">
                        <span className="truncate max-w-[260px]">
                          <strong className="font-semibold text-[#1d1d1f]">보낸사람:</strong>{' '}
                          {mail.sender}
                        </span>
                        {canAddExternalContact(mail.sender) && (
                          <button
                            type="button"
                            onClick={(e) =>
                              handleOpenAddContact(e, mail.senderName || mail.sender, mail.sender)
                            }
                            title="주소록에 추가"
                            className="inline-flex items-center gap-1 rounded-md border border-[#0071e3]/25 bg-[#0071e3]/8 px-1.5 py-0.5 text-[11px] font-medium text-[#0071e3] hover:bg-[#0071e3]/15 transition shrink-0"
                          >
                            <UserPlus className="h-3 w-3" />
                            <span>주소록 추가</span>
                          </button>
                        )}
                      </span>
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <Clock className="h-3 w-3 text-[#86868b]" />
                        {new Date(mail.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                <div
                  className="flex items-center gap-2 self-end sm:self-center shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Link
                    href={`/mail/${mail.id}`}
                    target="_blank"
                    rel="noreferrer"
                    title="새 탭에서 단독 열람"
                    className="inline-flex items-center gap-1 rounded-lg border border-black/[0.08] bg-white px-2.5 py-1 text-xs font-medium text-[#1d1d1f] hover:border-[#0071e3]/40 hover:text-[#0071e3] transition"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span className="hidden md:inline">새 탭</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => toggleExpand(mail.id)}
                    aria-label={isExpanded ? '메일 접기' : '메일 펼치기'}
                    className="inline-flex items-center justify-center rounded-lg border border-black/[0.08] bg-white p-1.5 text-[#6e6e73] hover:bg-black/[0.03] transition"
                  >
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Expanded Body & Actions */}
              {isExpanded && (
                <div>
                  {/* Per-mail Action Toolbar */}
                  <div className="flex flex-wrap items-center gap-2 border-b border-black/[0.06] bg-white px-6 py-3">
                    <button
                      type="button"
                      onClick={() =>
                        router.push(`/mail/compose?mode=reply&replyId=${mail.id}`)
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-2.5 py-1 text-xs font-semibold text-[#1d1d1f] shadow-xs hover:bg-black/[0.03] transition"
                    >
                      <Reply className="h-3.5 w-3.5 text-[#0071e3]" />
                      <span>답장</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        router.push(`/mail/compose?mode=replyAll&replyId=${mail.id}`)
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-2.5 py-1 text-xs font-semibold text-[#1d1d1f] shadow-xs hover:bg-black/[0.03] transition"
                    >
                      <ReplyAll className="h-3.5 w-3.5 text-[#6e6e73]" />
                      <span>전체답장</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        router.push(`/mail/compose?mode=forward&replyId=${mail.id}`)
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-2.5 py-1 text-xs font-semibold text-[#1d1d1f] shadow-xs hover:bg-black/[0.03] transition"
                    >
                      <Forward className="h-3.5 w-3.5 text-[#6e6e73]" />
                      <span>전달</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenCreateCalendarEvent(mail)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#0071e3]/25 bg-[#0071e3]/8 px-2.5 py-1 text-xs font-semibold text-[#0071e3] shadow-xs hover:bg-[#0071e3]/15 transition"
                    >
                      <CalendarPlus className="h-3.5 w-3.5 text-[#0071e3]" />
                      <span>일정 등록</span>
                    </button>

                    <div className="h-4 w-px bg-black/[0.08] mx-0.5 hidden sm:block" />

                    <button
                      type="button"
                      onClick={() => handleToggleRead(mail)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold shadow-xs transition ${
                        mail.isRead
                          ? 'border-black/[0.08] bg-white text-[#1d1d1f] hover:bg-black/[0.03]'
                          : 'border-[#0071e3]/30 bg-[#0071e3]/10 text-[#0071e3] hover:bg-[#0071e3]/15'
                      }`}
                    >
                      {mail.isRead ? (
                        <>
                          <MailIcon className="h-3.5 w-3.5 text-[#6e6e73]" />
                          <span>안읽음으로 표시</span>
                        </>
                      ) : (
                        <>
                          <MailCheck className="h-3.5 w-3.5 text-[#0071e3]" />
                          <span>읽음으로 표시</span>
                        </>
                      )}
                    </button>

                    <a
                      href={`/api/mails/${mail.id}/raw`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-2.5 py-1 text-xs font-semibold text-[#1d1d1f] shadow-xs hover:bg-black/[0.03] transition"
                    >
                      <Download className="h-3.5 w-3.5 text-[#6e6e73]" />
                      <span>원본 EML</span>
                    </a>

                    {spamFolderId && mail.folderId === spamFolderId ? (
                      <button
                        type="button"
                        onClick={() => handleUnreportSpam(mail)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#34c759]/30 bg-[#34c759]/10 px-2.5 py-1 text-xs font-semibold text-[#248a3d] shadow-xs hover:bg-[#34c759]/20 transition"
                      >
                        <ShieldCheck className="h-3.5 w-3.5 text-[#248a3d]" />
                        <span>정상 메일 복원</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleReportSpam(mail)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#ff9500]/30 bg-[#ff9500]/10 px-2.5 py-1 text-xs font-semibold text-[#b25000] shadow-xs hover:bg-[#ff9500]/20 transition"
                      >
                        <ShieldAlert className="h-3.5 w-3.5 text-[#b25000]" />
                        <span>스팸 신고</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleDelete(mail)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#ff3b30]/25 bg-[#ff3b30]/10 px-2.5 py-1 text-xs font-semibold text-[#ff3b30] hover:bg-[#ff3b30]/20 transition"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>삭제</span>
                    </button>
                  </div>

                  {/* Recipients & Security Badges */}
                  <div className="border-b border-black/[0.06] bg-[#f5f5f7]/40 px-6 py-3 space-y-2 text-xs text-[#6e6e73]">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[#1d1d1f]">받는사람:</span>
                      <span className="text-[#1d1d1f]">
                        {mail.recipients && mail.recipients.length > 0
                          ? mail.recipients
                              .map((r) =>
                                r.name && !r.address.includes(r.name)
                                  ? `${r.name} <${r.address}>`
                                  : r.address,
                              )
                              .join(', ')
                          : '지정되지 않음'}
                      </span>
                    </div>
                  </div>

                  {/* AI Assistant Panel */}
                  <div className="px-6 pt-4 empty:hidden">
                    <div className="rounded-xl border border-black/[0.06]">
                      <MailAiAssistantPanel
                        mailId={mail.id}
                        subject={mail.subject || ''}
                        senderEmail={mail.sender}
                        bodyHtml={mail.body?.html || undefined}
                        bodyText={mail.body?.text || undefined}
                        attachments={mail.attachments as any}
                        onReplyWithDraft={(draftBody) => {
                          if (typeof window !== 'undefined') {
                            sessionStorage.setItem('ai_reply_draft', draftBody);
                          }
                          router.push(`/mail/compose?mode=reply&replyId=${mail.id}`);
                        }}
                      />
                    </div>
                  </div>

                  {/* Attachments */}
                  {mail.attachments && mail.attachments.length > 0 && (
                    <div className="border-b border-black/[0.06] bg-[#f5f5f7]/40 px-6 py-4 mt-4">
                      <div className="flex items-center gap-2 text-xs font-semibold text-[#1d1d1f] mb-2">
                        <Paperclip className="h-4 w-4 text-[#0071e3]" />
                        <span>첨부파일 ({mail.attachments.length}개)</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {mail.attachments.map((att) => (
                          <a
                            key={att.id}
                            href={`/api/mails/${mail.id}/attachments/${att.id}`}
                            className="inline-flex items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-3 py-1.5 text-xs font-medium text-[#1d1d1f] shadow-xs hover:border-[#0071e3]/40 hover:bg-[#0071e3]/5 transition"
                          >
                            <FileText className="h-4 w-4 text-[#0071e3]" />
                            <span>{att.filename}</span>
                            <span className="text-[11px] text-[#86868b]">
                              ({formatFileSize(att.sizeBytes)})
                            </span>
                            <Download className="h-3 w-3 text-[#86868b] ml-1" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Mail Body */}
                  <div className="p-6">
                    {mail.body?.html ? (
                      <SandboxedMailBody html={mail.body.html} />
                    ) : mail.body?.text ? (
                      <pre className="whitespace-pre-wrap font-sans text-sm text-[#1d1d1f]">
                        {mail.body.text}
                      </pre>
                    ) : (
                      <p className="text-sm italic text-[#86868b]">
                        본문 내용이 없습니다.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {calendarTargetMail && (
        <EventModal
          isOpen={!!calendarTargetMail}
          onClose={() => setCalendarTargetMail(null)}
          calendars={calendars}
          initialDraft={{
            title: calendarTargetMail.subject || '(제목 없음)',
            description: `보낸사람: ${calendarTargetMail.sender}\n수신일시: ${new Date(calendarTargetMail.createdAt).toLocaleString('ko-KR')}\n\n${calendarTargetMail.body?.text || ''}`.slice(
              0,
              2000,
            ),
            sourceMailId: calendarTargetMail.id,
            attendees: calendarTargetMail.sender?.includes('@')
              ? [
                  {
                    email: calendarTargetMail.sender
                      .replace(/.*<([^>]+)>.*/, '$1')
                      .trim(),
                  },
                ]
              : [],
          }}
          onSave={handleSaveCalendarEvent}
        />
      )}

      <ContactModal
        isOpen={contactModalOpen}
        onClose={() => setContactModalOpen(false)}
        initialValues={contactInitialValues}
        groups={contactGroups}
        onSaved={handleContactSaved}
      />

      <ToastBanner toast={toast} />
    </div>
  );
}

export default function MailMultiViewPage() {
  return (
    <Suspense
      fallback={
        <div className="py-20 text-center text-slate-400">
          <p>선택한 메일을 불러오는 중...</p>
        </div>
      }
    >
      <MailMultiViewContent />
    </Suspense>
  );
}
