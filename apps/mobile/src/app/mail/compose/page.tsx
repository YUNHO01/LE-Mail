'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigation } from '@/contexts/NavigationContext';
import { fetchApi } from '@/lib/api';
import { RecipientInput, extractPureEmail } from '@/components/mail/RecipientInput';
import {
    ComposeAddressBookPanel,
    RecipientEntry,
    RecipientTarget,
} from '@/components/mail/ComposeAddressBookPanel';
import { AttachmentUploader, LocalAttachment } from '@/components/mail/AttachmentUploader';
import { MailEditor } from '@/components/mail/MailEditor';
import { ToggleSwitch } from '@/components/common';
import { MailMessageDto } from '@lemail/shared-types';
import {
    Send,
    Save,
    ArrowLeft,
    X,
    ChevronDown,
    ChevronUp,
    AlertCircle,
    CheckCircle2,
    Loader2,
    Mail as MailIcon,
    LogIn,
    Lock,
    ShieldCheck,
    Eye,
    EyeOff,
    KeyRound,
    Star,
    Upload,
    BookUser,
} from 'lucide-react';

function ComposeMailContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, isAuthenticated, isLoading: authLoading, refreshStorageUsage } = useAuth();
    const { startNavigation } = useNavigation();

    const [to, setTo] = useState<string[]>([]);
    const [cc, setCc] = useState<string[]>([]);
    const [bcc, setBcc] = useState<string[]>([]);
    const [showCc, setShowCc] = useState(false);
    const [showBcc, setShowBcc] = useState(false);
    const [subject, setSubject] = useState('');
    const [bodyHtml, setBodyHtml] = useState('');
    const [bodyText, setBodyText] = useState('');
    const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
    const [draftId, setDraftId] = useState<string | null>(null);

    const formatFileSize = (bytes: number): string => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
    };

    const totalAttachmentBytes = attachments.reduce((acc, a) => acc + a.sizeBytes, 0);
    const quotaMb = user?.mailboxQuotaMb ?? 512;
    const quotaBytes = Math.max(0, quotaMb) * 1024 * 1024;
    const usedBytes = user?.usedBytes ?? (user?.usedMb ?? 0) * 1024 * 1024;
    const remainingBytes = Math.max(0, quotaBytes - usedBytes);
    const estimatedBodyBytes = new Blob([subject, bodyHtml, bodyText]).size;
    const estimatedMailBytes = totalAttachmentBytes + estimatedBodyBytes;
    const isQuotaExhausted = Boolean(user) && (quotaMb <= 0 || usedBytes >= quotaBytes);
    const isQuotaInsufficient = Boolean(user) && !isQuotaExhausted && estimatedMailBytes > remainingBytes;
    const isSendBlockedByQuota = isQuotaExhausted || isQuotaInsufficient;
    const quotaBlockMessage = isQuotaExhausted
        ? '사서함 용량이 없어 메일을 발송할 수 없습니다. 불필요한 메일을 삭제하거나 관리자에게 용량 증설을 요청해 주세요.'
        : isQuotaInsufficient
            ? `사서함 잔여 용량(${formatFileSize(remainingBytes)})이 부족하여 현재 메일(${formatFileSize(estimatedMailBytes)})을 발송할 수 없습니다.`
            : null;

    // 보안 메일(비밀번호 설정) 및 중요 메일 상태
    const [isImportant, setIsImportant] = useState(false);
    const [isSecure, setIsSecure] = useState(false);
    const [securityPassword, setSecurityPassword] = useState('');
    const [securityPasswordConfirm, setSecurityPasswordConfirm] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    // 우측 주소록 레이어 상태
    const [desktopAddressBookOpen, setDesktopAddressBookOpen] = useState(true);
    const [mobileAddressBookOpen, setMobileAddressBookOpen] = useState(false);

    const formatRecipientEntry = (entry: RecipientEntry): string => {
        const cleanEmail = entry.email.trim();
        const cleanName = entry.name?.trim();
        return cleanName ? `${cleanName} <${cleanEmail}>` : cleanEmail;
    };

    const getRecipientSetter = (target: RecipientTarget) => {
        if (target === 'to') return setTo;
        if (target === 'cc') return setCc;
        return setBcc;
    };

    const toggleRecipientFromBook = (target: RecipientTarget, entry: RecipientEntry) => {
        const pureTarget = entry.email.trim().toLowerCase();
        if (!pureTarget) return;

        const currentList = target === 'to' ? to : target === 'cc' ? cc : bcc;
        const exists = currentList.some((item) => extractPureEmail(item).toLowerCase() === pureTarget);
        const setter = getRecipientSetter(target);

        if (exists) {
            setter((prev) => prev.filter((item) => extractPureEmail(item).toLowerCase() !== pureTarget));
        } else {
            setter((prev) => {
                if (prev.some((item) => extractPureEmail(item).toLowerCase() === pureTarget)) {
                    return prev;
                }
                return [...prev, formatRecipientEntry(entry)];
            });
            if (target === 'cc') setShowCc(true);
            if (target === 'bcc') setShowBcc(true);
        }
    };

    const addRecipientsBulkFromBook = (target: RecipientTarget, entries: RecipientEntry[]) => {
        if (entries.length === 0) return;

        const setter = getRecipientSetter(target);
        setter((prev) => {
            const existingSet = new Set(prev.map((item) => extractPureEmail(item).toLowerCase()));
            const additions: string[] = [];

            for (const entry of entries) {
                const pure = entry.email.trim().toLowerCase();
                if (pure && !existingSet.has(pure)) {
                    existingSet.add(pure);
                    additions.push(formatRecipientEntry(entry));
                }
            }

            return additions.length > 0 ? [...prev, ...additions] : prev;
        });

        if (target === 'cc') setShowCc(true);
        if (target === 'bcc') setShowBcc(true);
    };

    const [sending, setSending] = useState(false);
    const [sendingStep, setSendingStep] = useState<'sending' | 'success'>('sending');
    const [sendingStatusMessage, setSendingStatusMessage] = useState('메일을 발송하고 있습니다');
    const [sendingDetailMessage, setSendingDetailMessage] = useState('수신 서버로 메일을 안전하게 전송하고 있습니다. 잠시만 기다려 주세요.');
    const [savingDraft, setSavingDraft] = useState(false);
    const [loadingInitial, setLoadingInitial] = useState(false);
    const [statusMessage, setStatusMessage] = useState<{
        type: 'success' | 'error';
        text: string;
    } | null>(null);

    // URL 쿼리 파라미터 처리 (답장, 전달, 임시저장 복원)
    useEffect(() => {
        const mode = searchParams.get('mode');
        const replyId = searchParams.get('replyId');
        const existingDraftId = searchParams.get('draftId');
        const queryTo = searchParams.get('to');

        if (queryTo) {
            setTo([queryTo]);
        }

        if (existingDraftId) {
            setDraftId(existingDraftId);
        }

        const targetMailId = replyId || existingDraftId;
        if (targetMailId) {
            loadInitialMail(targetMailId, mode);
        } else {
            // 신규 메일 작성 시 사용자 서명 로드 및 적용
            loadUserSignature();
        }
    }, [searchParams]);

    const loadUserSignature = async () => {
        try {
            const sig = await fetchApi<{ useSignature: boolean; signatureHtml: string | null }>('/users/me/signature');
            if (sig && sig.useSignature && sig.signatureHtml) {
                setBodyHtml(`<p><br/></p><br/>${sig.signatureHtml}`);
            }
        } catch (_) {}
    };

    const loadInitialMail = async (mailId: string, mode: string | null) => {
        try {
            setLoadingInitial(true);
            const mail = await fetchApi<MailMessageDto>(`/mails/${mailId}`);
            if (!mail) return;

            const mailBodyHtml = mail.body?.html || (mail.body?.text ? `<p>${mail.body.text}</p>` : '');
            const formattedDate = new Date(mail.createdAt).toLocaleString('ko-KR');

            // 서명 로드 (답장/전달 시 인용문 앞에 첨부)
            let userSigHtml = '';
            if (mode === 'reply' || mode === 'replyAll' || mode === 'forward') {
                try {
                    const sig = await fetchApi<{ useSignature: boolean; signatureHtml: string | null }>('/users/me/signature');
                    if (sig && sig.useSignature && sig.signatureHtml) {
                        userSigHtml = `<br/>${sig.signatureHtml}`;
                    }
                } catch (_) {}
            }

            if (mode === 'reply') {
                // 보낸사람에게 답장
                setTo([mail.sender]);
                setSubject(mail.subject?.startsWith('Re:') ? mail.subject : `Re: ${mail.subject || ''}`);
                setBodyHtml(
                    `<p></p>${userSigHtml}<br/><div class="quote" style="border-left: 2px solid #cbd5e1; padding-left: 12px; margin-top: 16px; color: #64748b;">` +
                    `----- Original Message -----<br/>` +
                    `<b>From:</b> ${mail.sender}<br/>` +
                    `<b>Date:</b> ${formattedDate}<br/>` +
                    `<b>Subject:</b> ${mail.subject || '(제목 없음)'}<br/><br/>` +
                    `${mailBodyHtml}</div>`,
                );
            } else if (mode === 'replyAll') {
                // 전체 답장 (발신자 + 기존 수신자 중 나를 제외)
                const allRecipients = (mail.recipients || [])
                    .map((r) => r.address)
                    .filter((addr) => addr.toLowerCase() !== user?.email?.toLowerCase());

                setTo([mail.sender]);
                if (allRecipients.length > 0) {
                    setCc(allRecipients);
                    setShowCc(true);
                }
                setSubject(mail.subject?.startsWith('Re:') ? mail.subject : `Re: ${mail.subject || ''}`);
                setBodyHtml(
                    `<p></p>${userSigHtml}<br/><div class="quote" style="border-left: 2px solid #cbd5e1; padding-left: 12px; margin-top: 16px; color: #64748b;">` +
                    `----- Original Message -----<br/>` +
                    `<b>From:</b> ${mail.sender}<br/>` +
                    `<b>Date:</b> ${formattedDate}<br/>` +
                    `<b>Subject:</b> ${mail.subject || '(제목 없음)'}<br/><br/>` +
                    `${mailBodyHtml}</div>`,
                );
            } else if (mode === 'forward') {
                // 전달
                setSubject(mail.subject?.startsWith('Fwd:') ? mail.subject : `Fwd: ${mail.subject || ''}`);
                setBodyHtml(
                    `<p></p>${userSigHtml}<br/><div class="quote" style="border-left: 2px solid #cbd5e1; padding-left: 12px; margin-top: 16px; color: #64748b;">` +
                    `---------- Forwarded message ---------<br/>` +
                    `<b>From:</b> ${mail.sender}<br/>` +
                    `<b>Date:</b> ${formattedDate}<br/>` +
                    `<b>Subject:</b> ${mail.subject || '(제목 없음)'}<br/><br/>` +
                    `${mailBodyHtml}</div>`,
                );
            } else {
                // 임시저장 내용 복원
                const toList = (mail.recipients || [])
                    .filter((r) => r.type === 'TO')
                    .map((r) => r.address);
                const ccList = (mail.recipients || [])
                    .filter((r) => r.type === 'CC')
                    .map((r) => r.address);
                const bccList = (mail.recipients || [])
                    .filter((r) => r.type === 'BCC')
                    .map((r) => r.address);

                if (toList.length > 0) setTo(toList);
                if (ccList.length > 0) {
                    setCc(ccList);
                    setShowCc(true);
                }
                if (bccList.length > 0) {
                    setBcc(bccList);
                    setShowBcc(true);
                }
                setSubject(mail.subject || '');
                setBodyHtml(mailBodyHtml);
            }
        } catch (err: any) {
            console.error('기존 메일 로드 실패:', err);
        } finally {
            setLoadingInitial(false);
        }
    };

    const handleSend = async () => {
        if (quotaBlockMessage) {
            setStatusMessage({
                type: 'error',
                text: quotaBlockMessage,
            });
            return;
        }

        if (to.length === 0) {
            setStatusMessage({
                type: 'error',
                text: '받는 사람 이메일 주소를 1개 이상 입력해 주세요.',
            });
            return;
        }

        if (isSecure) {
            if (!securityPassword || securityPassword.trim().length < 4) {
                setStatusMessage({
                    type: 'error',
                    text: '보안 메일 비밀번호는 최소 4자 이상 입력해 주세요.',
                });
                return;
            }
            if (securityPassword !== securityPasswordConfirm) {
                setStatusMessage({
                    type: 'error',
                    text: '보안 메일 비밀번호와 비밀번호 확인이 일치하지 않습니다.',
                });
                return;
            }
        }

        try {
            setSending(true);
            setSendingStep('sending');
            setSendingStatusMessage(
                attachments.length > 0
                    ? '첨부파일 업로드 및 메일 발송 중'
                    : '메일을 발송하고 있습니다'
            );
            setSendingDetailMessage(
                attachments.length > 0
                    ? `첨부파일 ${attachments.length}개(${formatFileSize(totalAttachmentBytes)}) 및 메일 본문을 서버로 전송하고 있습니다.`
                    : '수신 서버로 메일을 안전하게 전송하고 있습니다. 잠시만 기다려 주세요.'
            );
            setStatusMessage(null);

            const mode = searchParams.get('mode');
            const replyId = searchParams.get('replyId');

            const payload: any = {
                to: to.map(extractPureEmail),
                cc: cc.length > 0 ? cc.map(extractPureEmail) : undefined,
                bcc: bcc.length > 0 ? bcc.map(extractPureEmail) : undefined,
                subject: subject.trim() || '(제목 없음)',
                bodyHtml: bodyHtml || '<p></p>',
                bodyText: bodyText || '',
                attachments: attachments.map((att) => ({
                    filename: att.filename,
                    contentType: att.contentType,
                    sizeBytes: att.sizeBytes,
                    contentBase64: att.contentBase64,
                })),
                isImportant,
                isSecure,
                securityPassword: isSecure ? securityPassword.trim() : undefined,
                replyToMailId:
                    (mode === 'reply' || mode === 'replyAll') && replyId ? replyId : undefined,
                forwardFromMailId: mode === 'forward' && replyId ? replyId : undefined,
            };

            await fetchApi('/mails/send', {
                method: 'POST',
                body: JSON.stringify(payload),
            });

            refreshStorageUsage?.();

            // 근태관리(ams) 결재 신청 로직과 동일하게 성공 시에는 setSending(false)를 호출하지 않고
            // 화면 전환이 완료되어 컴포넌트가 unmount될 때까지 로딩 상태를 유지합니다.
            setSendingStep('success');
            setSendingStatusMessage('메일 발송이 완료되었습니다!');
            setSendingDetailMessage('보낸편지함으로 이동하고 있습니다. 잠시만 기다려 주세요...');

            setStatusMessage({
                type: 'success',
                text: '메일이 성공적으로 발송되었습니다. 보낸편지함으로 이동합니다...',
            });

            setTimeout(() => {
                startNavigation('/mail/sent');
                router.push('/mail/sent');
            }, 800);
        } catch (err: any) {
            console.error('메일 발송 오류:', err);
            // 실패했을 때만 로딩 상태를 해제하여 사용자가 내용 수정 및 재시도할 수 있도록 합니다.
            setSending(false);
            setSendingStep('sending');
            setStatusMessage({
                type: 'error',
                text: err.message || '메일 발송 중 오류가 발생했습니다.',
            });
        }
    };

    const handleSaveDraft = async () => {
        try {
            setSavingDraft(true);
            setStatusMessage(null);

            const payload = {
                draftId: draftId || undefined,
                to: to.length > 0 ? to.map(extractPureEmail) : undefined,
                cc: cc.length > 0 ? cc.map(extractPureEmail) : undefined,
                bcc: bcc.length > 0 ? bcc.map(extractPureEmail) : undefined,
                subject: subject.trim() || '(임시저장 메일)',
                bodyHtml: bodyHtml || '<p></p>',
                bodyText: bodyText || '',
            };

            const res = await fetchApi<{ success: boolean; draftId: string }>('/mails/drafts', {
                method: 'POST',
                body: JSON.stringify(payload),
            });

            if (res.draftId) {
                setDraftId(res.draftId);
            }

            setStatusMessage({
                type: 'success',
                text: '임시보관함에 저장되었습니다.',
            });

            setTimeout(() => {
                setStatusMessage(null);
            }, 3000);
        } catch (err: any) {
            console.error('임시저장 오류:', err);
            setStatusMessage({
                type: 'error',
                text: err.message || '임시저장 중 오류가 발생했습니다.',
            });
        } finally {
            setSavingDraft(false);
        }
    };

    if (!authLoading && !isAuthenticated) {
        return (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white py-16 px-6 text-center shadow-sm">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 mb-4">
                    <AlertCircle className="h-7 w-7" />
                </div>
                <h2 className="text-xl font-bold text-slate-900">로그인이 필요한 서비스입니다</h2>
                <p className="mt-1 text-sm text-slate-500 max-w-sm">
                    메일을 작성하고 발송하시려면 먼저 계정으로 로그인해 주세요.
                </p>
                <Link
                    href="/login"
                    className="mt-6 flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 transition"
                >
                    <LogIn className="h-4 w-4" />
                    <span>로그인 페이지로 이동</span>
                </Link>
            </div>
        );
    }

    return (
        <div className="flex min-h-[100dvh] flex-col bg-white">
            {/* 발송 로딩 오버레이 */}
            {sending && (
                <div
                    role="alertdialog"
                    aria-busy="true"
                    aria-modal="true"
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
                >
                    <div className="w-full max-w-xs rounded-3xl bg-white p-6 shadow-2xl flex flex-col items-center text-center space-y-4">
                        <div className="h-14 w-14 rounded-full bg-sky-50 flex items-center justify-center">
                            {sendingStep === 'success' ? (
                                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                            ) : (
                                <Loader2 className="h-8 w-8 text-[#007AFF] animate-spin" />
                            )}
                        </div>
                        <div className="space-y-1">
                            <h3 className="text-base font-bold text-slate-900">{sendingStatusMessage}</h3>
                            <p className="text-xs text-slate-500">{sendingDetailMessage}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* 상단 네이티브 바 */}
            <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-100 bg-white/95 px-3 backdrop-blur-xl">
                <button
                    type="button"
                    onClick={() => router.back()}
                    className="px-2 py-1.5 text-sm font-medium text-slate-600 active:text-slate-900"
                >
                    취소
                </button>

                <h1 className="text-base font-bold text-slate-900">메일 쓰기</h1>

                <div className="flex items-center gap-1.5">
                    <button
                        type="button"
                        onClick={handleSaveDraft}
                        disabled={savingDraft || sending}
                        aria-label="임시저장"
                        className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 active:bg-slate-100 disabled:opacity-40"
                    >
                        {savingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    </button>

                    <button
                        type="button"
                        onClick={handleSend}
                        disabled={sending || savingDraft || isSendBlockedByQuota}
                        className="flex items-center gap-1 rounded-full bg-[#007AFF] px-4 py-1.5 text-xs font-bold text-white shadow-sm shadow-blue-500/25 active:scale-95 disabled:opacity-40"
                    >
                        <span>보내기</span>
                    </button>
                </div>
            </header>

            {quotaBlockMessage && (
                <div className="mx-3 mt-2 flex items-center gap-2 rounded-2xl bg-amber-50 p-3 text-xs font-medium text-amber-900 border border-amber-200">
                    <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>{quotaBlockMessage}</span>
                </div>
            )}

            {statusMessage && (
                <div
                    className={`mx-3 mt-2 flex items-center justify-between rounded-2xl p-3 text-xs font-medium ${
                        statusMessage.type === 'success'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-rose-50 text-rose-800 border border-rose-200'
                    }`}
                >
                    <div className="flex items-center gap-2">
                        {statusMessage.type === 'success' ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                        ) : (
                            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                        )}
                        <span>{statusMessage.text}</span>
                    </div>
                    <button type="button" onClick={() => setStatusMessage(null)} className="p-0.5">
                        <X className="h-3.5 w-3.5" />
                    </button>
                </div>
            )}

            {loadingInitial && (
                <div className="flex items-center justify-center py-4 text-xs text-slate-400 gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-[#007AFF]" />
                    <span>메일 정보를 불러오는 중...</span>
                </div>
            )}

            {/* 입력 폼 */}
            <div className="flex-1 flex flex-col divide-y divide-slate-100">
                <RecipientInput
                    label="받는사람"
                    recipients={to}
                    onChange={setTo}
                    placeholder="이메일 입력"
                    rightAction={
                        <div className="flex items-center gap-1">
                            {(!showCc || !showBcc) && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowCc(true);
                                        setShowBcc(true);
                                    }}
                                    className="rounded-full px-2 py-1 text-[11px] font-semibold text-slate-500 active:bg-slate-100"
                                >
                                    참조
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => setMobileAddressBookOpen(true)}
                                aria-label="주소록에서 선택"
                                className="flex h-7 w-7 items-center justify-center rounded-full bg-[#007AFF]/10 text-[#007AFF] active:scale-95"
                            >
                                <BookUser className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    }
                />

                {showCc && (
                    <RecipientInput
                        label="참조"
                        recipients={cc}
                        onChange={setCc}
                        placeholder="참조 이메일"
                        rightAction={
                            <button
                                type="button"
                                onClick={() => {
                                    setShowCc(false);
                                    setCc([]);
                                }}
                                className="p-1 text-slate-400"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        }
                    />
                )}

                {showBcc && (
                    <RecipientInput
                        label="숨은참조"
                        recipients={bcc}
                        onChange={setBcc}
                        placeholder="숨은참조 이메일"
                        rightAction={
                            <button
                                type="button"
                                onClick={() => {
                                    setShowBcc(false);
                                    setBcc([]);
                                }}
                                className="p-1 text-slate-400"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        }
                    />
                )}

                {/* 제목 + 중요/보안 퀵 토글 */}
                <div className="flex items-center gap-2 px-3 py-2.5">
                    <span className="w-16 shrink-0 text-xs font-semibold text-slate-400">제목</span>
                    <input
                        type="text"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        placeholder="제목을 입력하세요"
                        className="flex-1 bg-transparent text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none"
                    />
                    <button
                        type="button"
                        onClick={() => setIsImportant(!isImportant)}
                        aria-label="중요 메일"
                        className={`rounded-full p-1.5 ${isImportant ? 'bg-amber-50 text-amber-500' : 'text-slate-300'}`}
                    >
                        <Star className={`h-4 w-4 ${isImportant ? 'fill-amber-400' : ''}`} />
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            const next = !isSecure;
                            setIsSecure(next);
                            if (!next) {
                                setSecurityPassword('');
                                setSecurityPasswordConfirm('');
                            }
                        }}
                        aria-label="보안 메일"
                        className={`rounded-full p-1.5 ${isSecure ? 'bg-sky-50 text-[#007AFF]' : 'text-slate-300'}`}
                    >
                        <Lock className="h-4 w-4" />
                    </button>
                </div>

                {/* 보안 메일 비밀번호 입력 (활성 시) */}
                {isSecure && (
                    <div className="bg-sky-50/50 px-3 py-3 space-y-2">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-[#007AFF]">
                            <ShieldCheck className="h-4 w-4" />
                            <span>보안 메일 비밀번호 설정</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={securityPassword}
                                onChange={(e) => setSecurityPassword(e.target.value)}
                                placeholder="열람 비밀번호 (4자+)"
                                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs focus:border-[#007AFF] focus:outline-none"
                            />
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={securityPasswordConfirm}
                                onChange={(e) => setSecurityPasswordConfirm(e.target.value)}
                                placeholder="비밀번호 확인"
                                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs focus:border-[#007AFF] focus:outline-none"
                            />
                        </div>
                    </div>
                )}

                {/* 첨부파일 */}
                <div className="px-3 py-2">
                    <AttachmentUploader attachments={attachments} onChange={setAttachments} />
                </div>

                {/* 본문 에디터 */}
                <div className="flex-1 px-1 pb-6">
                    <MailEditor
                        value={bodyHtml}
                        onChange={(html, text) => {
                            setBodyHtml(html);
                            setBodyText(text);
                        }}
                        placeholder="메일 내용을 작성하세요..."
                        minHeight="320px"
                    />
                </div>
            </div>

            {/* 주소록 선택 바텀 시트 */}
            {mobileAddressBookOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-end bg-slate-900/45 backdrop-blur-[1px]"
                    onClick={() => setMobileAddressBookOpen(false)}
                >
                    <div className="w-full" onClick={(e) => e.stopPropagation()}>
                        <ComposeAddressBookPanel
                            to={to}
                            cc={cc}
                            bcc={bcc}
                            onToggleRecipient={toggleRecipientFromBook}
                            onAddRecipientsBulk={addRecipientsBulkFromBook}
                            onClose={() => setMobileAddressBookOpen(false)}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

export default function ComposeMailPage() {
    return (
        <Suspense
            fallback={
                <div className="flex items-center justify-center py-20 text-slate-400 text-xs">
                    <Loader2 className="h-6 w-6 animate-spin text-sky-600 mr-2" />
                    <span>메일 작성 화면 로딩 중...</span>
                </div>
            }
        >
            <ComposeMailContent />
        </Suspense>
    );
}
