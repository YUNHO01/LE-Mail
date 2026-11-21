'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
import {
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
  MoreHorizontal,
  X,
  UserPlus,
  FolderInput,
  Folder,
  Inbox,
  Send,
  FileEdit,
} from 'lucide-react';

function formatAttachmentSize(bytes: number | string): string {
  const num = Number(bytes);
  if (!Number.isFinite(num) || num <= 0) return '0 B';
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(1)} MB`;
}

export default function MailDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [mail, setMail] = useState<MailMessageDto | null>(null);
  const [folders, setFolders] = useState<MailFolderDto[]>([]);
  const [spamFolderId, setSpamFolderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [calendars, setCalendars] = useState<CalendarDto[]>([]);
  const [calendarModalOpen, setCalendarModalOpen] = useState(false);
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [moveSheetOpen, setMoveSheetOpen] = useState(false);
  const [moving, setMoving] = useState(false);

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

  const handleOpenAddContact = async (name?: string | null, rawEmail?: string | null) => {
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

        const candidateEmails = Array.from(
          new Set(
            [
              extractEmail(data.sender),
              ...(data.recipients || []).map((r) => extractEmail(r.address)),
            ].filter((e) => e && e.includes('@')),
          ),
        );
        if (candidateEmails.length > 0) {
          contactsApi
            .checkEmails(candidateEmails)
            .then((res) => {
              if (res?.statuses) {
                setEmailStatuses(res.statuses);
              }
            })
            .catch(() => setEmailStatuses({}));
        } else {
          setEmailStatuses({});
        }

        // 폴더 목록 조회하여 SPAM 폴더 ID 식별 및 이동 목록 저장
        const loadedFolders = await fetchApi<MailFolderDto[]>('/mail-folders');
        setFolders(loadedFolders || []);
        const spam = (loadedFolders || []).find((f) => f.type === FolderType.SPAM);
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

  const flattenedFolders = useMemo(() => {
    const list: Array<MailFolderDto & { depth: number }> = [];
    const walk = (nodes: MailFolderDto[], depth = 0) => {
      for (const node of nodes) {
        list.push({ ...node, depth });
        if (node.children && node.children.length > 0) {
          walk(node.children, depth + 1);
        }
      }
    };
    walk(folders);
    return list;
  }, [folders]);

  const getFolderIcon = (folderType: FolderType) => {
    switch (folderType) {
      case FolderType.INBOX:
        return <Inbox className="h-4 w-4 text-sky-600 shrink-0" />;
      case FolderType.SENT:
        return <Send className="h-4 w-4 text-sky-600 shrink-0" />;
      case FolderType.DRAFTS:
        return <FileEdit className="h-4 w-4 text-amber-600 shrink-0" />;
      case FolderType.SPAM:
        return <ShieldAlert className="h-4 w-4 text-rose-500 shrink-0" />;
      case FolderType.TRASH:
        return <Trash2 className="h-4 w-4 text-slate-400 shrink-0" />;
      case FolderType.CUSTOM:
      default:
        return <Folder className="h-4 w-4 text-amber-500 shrink-0" />;
    }
  };

  const handleMove = async (targetFolder: MailFolderDto) => {
    if (!mail || moving || mail.folderId === targetFolder.id) return;
    setMoveSheetOpen(false);
    setMoving(true);
    try {
      await fetchApi(`/mails/${mail.id}/move`, {
        method: 'PATCH',
        body: JSON.stringify({ targetFolderId: targetFolder.id }),
      });
      setMail((prev) => (prev ? { ...prev, folderId: targetFolder.id } : prev));
      window.dispatchEvent(new CustomEvent('mail:refresh-folders'));
      alert(`[${targetFolder.name}] 편지함으로 이동했습니다.`);
    } catch (err: any) {
      alert(err.message || '편지함 이동 실패');
    } finally {
      setMoving(false);
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

  const handleClose = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/mail/inbox');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-[#F2F2F7]">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-100 bg-white/95 px-4 backdrop-blur-xl">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#007AFF]/10 text-[#007AFF]">
              <MailIcon className="h-4 w-4" />
            </div>
            <h1 className="text-base font-bold text-slate-900 truncate">메일 상세</h1>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="닫기"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 active:bg-slate-100 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="px-3 py-3">
          <div className="rounded-2xl border border-slate-200/60 bg-white p-4 space-y-4 animate-pulse">
            <div className="h-6 w-3/4 rounded bg-slate-200" />
            <div className="space-y-2">
              <div className="h-3.5 w-1/2 rounded bg-slate-100" />
              <div className="h-3.5 w-2/3 rounded bg-slate-100" />
            </div>
            <div className="h-40 w-full rounded-xl bg-slate-100" />
          </div>
        </div>
      </div>
    );
  }

  if (!mail) return null;

  const isSpamMail = Boolean(spamFolderId && mail.folderId === spamFolderId);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#F2F2F7]">
      {/* 상단 네이티브 바 (메일 쓰기와 동일 형식) */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-100 bg-white/95 px-4 backdrop-blur-xl">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#007AFF]/10 text-[#007AFF]">
            <MailIcon className="h-4 w-4" />
          </div>
          <h1 className="text-base font-bold text-slate-900 truncate">메일 상세</h1>
        </div>

        <button
          type="button"
          onClick={handleClose}
          aria-label="닫기"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 active:bg-slate-100 hover:bg-slate-100 hover:text-slate-600 transition"
        >
          <X className="h-5 w-5" />
        </button>
      </header>

      {/* Main Mail Container */}
      <div className="flex-1 px-3 pt-3 pb-24">
        <div className="rounded-2xl border border-slate-200/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        {/* Header Info */}
        <div className="border-b border-slate-100 bg-slate-50/40 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <button
              type="button"
              onClick={handleToggleStar}
              title={mail.isStarred ? '중요 메일 해제' : '중요 메일 표시'}
              className="mt-0.5 p-1 rounded-lg active:bg-amber-50 transition shrink-0"
            >
              <Star
                className={`h-5 w-5 ${
                  mail.isStarred
                    ? 'fill-amber-400 text-amber-400'
                    : 'text-slate-300'
                }`}
              />
            </button>
            <h1 className="text-lg font-bold leading-snug text-slate-900 break-words min-w-0 flex-1">
              {mail.subject || '(제목 없음)'}
            </h1>
          </div>

          <div className="space-y-1.5 text-xs text-slate-600">
            <div className="flex items-start gap-2">
              <span className="w-14 shrink-0 font-semibold text-slate-500">보낸사람</span>
              <div className="min-w-0 flex-1 flex flex-wrap items-center gap-1.5">
                <span className="break-all font-medium text-slate-900">
                  {mail.senderName && !mail.sender.includes(mail.senderName)
                    ? `${mail.senderName} <${mail.sender}>`
                    : mail.sender}
                </span>
                {canAddExternalContact(mail.sender) && (
                  <button
                    type="button"
                    onClick={() => handleOpenAddContact(mail.senderName, mail.sender)}
                    title="주소록에 추가"
                    className="inline-flex items-center gap-1 rounded-md border border-[#007AFF]/25 bg-[#007AFF]/10 px-2 py-0.5 text-[11px] font-semibold text-[#007AFF] active:bg-[#007AFF]/20 transition shrink-0"
                  >
                    <UserPlus className="h-3 w-3" />
                    <span>주소록 추가</span>
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-14 shrink-0 font-semibold text-slate-500">받는사람</span>
              <div className="min-w-0 flex-1 break-all text-slate-700 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                {mail.recipients && mail.recipients.length > 0 ? (
                  mail.recipients.map((r, idx) => {
                    const label =
                      r.name && !r.address.includes(r.name)
                        ? `${r.name} <${r.address}>`
                        : r.address;
                    const addable = canAddExternalContact(r.address);
                    return (
                      <span key={r.id || `${r.address}-${idx}`} className="inline-flex items-center gap-1">
                        <span>
                          {label}
                          {idx < mail.recipients!.length - 1 ? ',' : ''}
                        </span>
                        {addable && (
                          <button
                            type="button"
                            onClick={() => handleOpenAddContact(r.name, r.address)}
                            title={`${r.address} 주소록에 추가`}
                            aria-label={`${r.address} 주소록에 추가`}
                            className="inline-flex items-center justify-center rounded p-0.5 text-[#007AFF] active:bg-[#007AFF]/15 transition"
                          >
                            <UserPlus className="h-3 w-3" />
                          </button>
                        )}
                      </span>
                    );
                  })
                ) : (
                  <span>지정되지 않음</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 pt-0.5 text-[11px] text-slate-400">
              <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <span>{new Date(mail.createdAt).toLocaleString('ko-KR')}</span>
            </div>
          </div>

        </div>

        {/* AI Assistant Panel */}
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

        {/* Attachments Section if any */}
        {mail.attachments && mail.attachments.length > 0 && (
          <div className="border-b border-slate-100 bg-sky-50/30 p-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-2">
              <Paperclip className="h-3.5 w-3.5 text-[#007AFF]" />
              <span>첨부파일 ({mail.attachments.length}개)</span>
            </div>
            <div className="flex flex-col gap-2">
              {mail.attachments.map((att) => (
                <a
                  key={att.id}
                  href={`/api/mails/${mail.id}/attachments/${att.id}`}
                  className="flex items-center gap-2.5 rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-xs font-medium text-slate-800 shadow-xs active:bg-sky-50 transition min-w-0"
                >
                  <FileText className="h-4 w-4 text-[#007AFF] shrink-0" />
                  <span className="truncate min-w-0 flex-1">{att.filename}</span>
                  <span className="text-[11px] text-slate-400 shrink-0">
                    {formatAttachmentSize(att.sizeBytes)}
                  </span>
                  <Download className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Mail Body */}
        <div className="p-4">
          {mail.body?.html ? (
            <SandboxedMailBody html={mail.body.html} />
          ) : mail.body?.text ? (
            <pre className="whitespace-pre-wrap break-words font-sans text-[15px] leading-relaxed text-slate-800">
              {mail.body.text}
            </pre>
          ) : (
            <p className="text-sm italic text-slate-400">본문 내용이 없습니다.</p>
          )}
        </div>
      </div>
      </div>

      {/* 하단 고정 액션 바 */}
      <div className="fixed bottom-0 left-0 right-0 z-30 flex items-center gap-2 border-t border-slate-100 bg-white/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl shadow-[0_-2px_10px_rgba(0,0,0,0.03)]">
        <button
          type="button"
          onClick={() => router.push(`/mail/compose?mode=reply&replyId=${mail.id}`)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#007AFF] px-3 py-3 text-sm font-semibold text-white shadow-sm shadow-blue-500/20 active:scale-[0.98] transition whitespace-nowrap"
        >
          <Reply className="h-4 w-4 shrink-0" />
          <span>답장</span>
        </button>
        <button
          type="button"
          onClick={() => router.push(`/mail/compose?mode=replyAll&replyId=${mail.id}`)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700 active:bg-slate-100 transition whitespace-nowrap"
        >
          <ReplyAll className="h-4 w-4 text-slate-500 shrink-0" />
          <span>전체답장</span>
        </button>
        <button
          type="button"
          onClick={() => router.push(`/mail/compose?mode=forward&replyId=${mail.id}`)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700 active:bg-slate-100 transition whitespace-nowrap"
        >
          <Forward className="h-4 w-4 text-slate-500 shrink-0" />
          <span>전달</span>
        </button>
        <button
          type="button"
          onClick={() => setActionSheetOpen(true)}
          aria-label="더보기"
          title="더보기"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 active:bg-slate-50 transition"
        >
          <MoreHorizontal className="h-5 w-5" />
        </button>
      </div>

      {/* Mobile Action Bottom Sheet */}
      {actionSheetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-[1px]"
          onClick={() => setActionSheetOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-t-3xl bg-white p-4 pb-6 shadow-2xl space-y-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-2 pb-2 border-b border-slate-100">
              <span className="text-sm font-bold text-slate-900">메일 작업</span>
              <button
                type="button"
                onClick={() => setActionSheetOpen(false)}
                className="rounded-full p-1 text-slate-400 active:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  setActionSheetOpen(false);
                  router.push(`/mail/compose?mode=reply&replyId=${mail.id}`);
                }}
                className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-slate-800 active:bg-slate-100 text-left"
              >
                <Reply className="h-4 w-4 text-slate-500" />
                <span>답장</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActionSheetOpen(false);
                  router.push(`/mail/compose?mode=replyAll&replyId=${mail.id}`);
                }}
                className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-slate-800 active:bg-slate-100 text-left"
              >
                <ReplyAll className="h-4 w-4 text-slate-500" />
                <span>전체답장</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActionSheetOpen(false);
                  router.push(`/mail/compose?mode=forward&replyId=${mail.id}`);
                }}
                className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-slate-800 active:bg-slate-100 text-left"
              >
                <Forward className="h-4 w-4 text-slate-500" />
                <span>전달</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActionSheetOpen(false);
                  handleOpenCreateCalendarEvent();
                }}
                className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-violet-700 active:bg-violet-50 text-left"
              >
                <CalendarPlus className="h-4 w-4 text-violet-600" />
                <span>일정 등록</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActionSheetOpen(false);
                  setMoveSheetOpen(true);
                }}
                className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-slate-800 active:bg-slate-100 text-left"
              >
                <FolderInput className="h-4 w-4 text-[#007AFF]" />
                <span>편지함 이동</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActionSheetOpen(false);
                  handleToggleRead();
                }}
                className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-slate-800 active:bg-slate-100 text-left"
              >
                {mail.isRead ? (
                  <>
                    <MailIcon className="h-4 w-4 text-slate-500" />
                    <span>안읽음으로 표시</span>
                  </>
                ) : (
                  <>
                    <MailCheck className="h-4 w-4 text-[#007AFF]" />
                    <span>읽음으로 표시</span>
                  </>
                )}
              </button>

              <a
                href={`/api/mails/${mail.id}/raw`}
                target="_blank"
                rel="noreferrer"
                onClick={() => setActionSheetOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-slate-800 active:bg-slate-100"
              >
                <Download className="h-4 w-4 text-slate-500" />
                <span>원본 EML 다운로드</span>
              </a>

              {isSpamMail ? (
                <button
                  type="button"
                  onClick={() => {
                    setActionSheetOpen(false);
                    handleUnreportSpam();
                  }}
                  className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-emerald-700 active:bg-emerald-50 text-left"
                >
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  <span>정상 메일 복원</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setActionSheetOpen(false);
                    handleReportSpam();
                  }}
                  className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-amber-700 active:bg-amber-50 text-left"
                >
                  <ShieldAlert className="h-4 w-4 text-amber-600" />
                  <span>스팸 신고</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setActionSheetOpen(false);
                  handleDelete();
                }}
                className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-rose-600 active:bg-rose-50 text-left"
              >
                <Trash2 className="h-4 w-4 text-rose-500" />
                <span>메일 삭제</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 편지함 이동 바텀 시트 */}
      {moveSheetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-[1px]"
          onClick={() => setMoveSheetOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-t-3xl bg-white p-4 pb-6 shadow-2xl space-y-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-2 pb-2 border-b border-slate-100">
              <span className="text-sm font-bold text-slate-900">이동할 편지함 선택</span>
              <button
                type="button"
                onClick={() => setMoveSheetOpen(false)}
                className="rounded-full p-1 text-slate-400 active:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto space-y-1 pt-1">
              {flattenedFolders.map((f) => {
                const isCurrent = f.id === mail.folderId;
                return (
                  <button
                    key={f.id}
                    type="button"
                    disabled={isCurrent || moving}
                    onClick={() => handleMove(f)}
                    style={{ paddingLeft: `${f.depth * 16 + 12}px` }}
                    className={`w-full pr-3 py-2.5 rounded-xl text-left text-sm flex items-center justify-between transition ${
                      isCurrent
                        ? 'text-slate-400 cursor-not-allowed'
                        : 'text-slate-800 active:bg-slate-100'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 truncate">
                      {getFolderIcon(f.type)}
                      <span className="truncate font-medium">{f.name}</span>
                    </span>
                    {isCurrent && <span className="text-xs text-slate-400 shrink-0 ml-2">(현재)</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

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

      <ContactModal
        isOpen={contactModalOpen}
        onClose={() => setContactModalOpen(false)}
        initialValues={contactInitialValues}
        groups={contactGroups}
        onSaved={handleContactSaved}
      />
    </div>
  );
}
