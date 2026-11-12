'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigation } from '@/contexts/NavigationContext';
import { fetchApi } from '@/lib/api';
import { RecipientInput, extractPureEmail } from '@/components/mail/RecipientInput';
import { AttachmentUploader, LocalAttachment } from '@/components/mail/AttachmentUploader';
import { MailEditor } from '@/components/mail/MailEditor';
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

    const totalAttachmentBytes = attachments.reduce((acc, a) => acc + a.sizeBytes, 0);

    const formatFileSize = (bytes: number): string => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
    };

    // 보안 메일(비밀번호 설정) 및 중요 메일 상태
    const [isImportant, setIsImportant] = useState(false);
    const [isSecure, setIsSecure] = useState(false);
    const [securityPassword, setSecurityPassword] = useState('');
    const [securityPasswordConfirm, setSecurityPasswordConfirm] = useState('');
    const [showPassword, setShowPassword] = useState(false);

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
        <div className="w-full max-w-5xl space-y-5 pb-12">
            {/* 편지 발송 및 첨부파일 업로드 로딩 오버레이 */}
            {sending && (
                <div
                    role="alertdialog"
                    aria-busy="true"
                    aria-modal="true"
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
                >
                    <div className="relative w-full max-w-md rounded-2xl bg-white p-6 sm:p-8 shadow-2xl border border-slate-100 flex flex-col items-center text-center space-y-5">
                        {/* 상단 애니메이션 아이콘 */}
                        <div className="relative flex items-center justify-center">
                            {sendingStep === 'success' ? (
                                <div className="h-20 w-20 rounded-full bg-emerald-50 flex items-center justify-center animate-in zoom-in-75 duration-300">
                                    <CheckCircle2 className="h-10 w-10 text-emerald-600" />
                                </div>
                            ) : (
                                <>
                                    <div className="h-20 w-20 rounded-full bg-sky-50 flex items-center justify-center">
                                        {attachments.length > 0 ? (
                                            <Upload className="h-9 w-9 text-sky-600 animate-bounce" />
                                        ) : (
                                            <Send className="h-9 w-9 text-sky-600 animate-pulse" />
                                        )}
                                    </div>
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                        <Loader2 className="h-24 w-24 text-sky-500 animate-spin opacity-30" />
                                    </div>
                                </>
                            )}
                        </div>

                        {/* 메시지 영역 */}
                        <div className="space-y-2">
                            <h3 className="text-lg font-bold text-slate-900">
                                {sendingStatusMessage}
                            </h3>
                            {sendingStep === 'sending' && attachments.length > 0 ? (
                                <div className="space-y-1.5">
                                    <div className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 border border-sky-100">
                                        <span>첨부파일 {attachments.length}개</span>
                                        <span className="text-sky-400">·</span>
                                        <span>{formatFileSize(totalAttachmentBytes)}</span>
                                    </div>
                                    <p className="text-xs text-slate-500">
                                        {sendingDetailMessage}
                                    </p>
                                    <p className="text-[11px] text-slate-400">
                                        네트워크 및 파일 용량에 따라 시간이 걸릴 수 있습니다.
                                    </p>
                                </div>
                            ) : (
                                <p className="text-xs text-slate-500">
                                    {sendingDetailMessage}
                                </p>
                            )}
                        </div>

                        {/* 진행 프로그레스 바 */}
                        <div className="w-full space-y-2.5 pt-1">
                            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full w-full transition-all duration-500 ${
                                        sendingStep === 'success'
                                            ? 'bg-emerald-500'
                                            : 'bg-gradient-to-r from-sky-500 via-indigo-500 to-sky-500 animate-pulse'
                                    }`}
                                />
                            </div>
                            <p
                                className={`text-[11px] font-medium rounded-lg py-1.5 px-3 border transition-colors ${
                                    sendingStep === 'success'
                                        ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                                        : 'text-amber-600 bg-amber-50 border-amber-200/60'
                                }`}
                            >
                                {sendingStep === 'success'
                                    ? '화면을 안전하게 이동하고 있습니다. 잠시만 기다려 주세요.'
                                    : '메일 전송이 완료될 때까지 브라우저 창을 닫거나 새로고침하지 마세요.'}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Header bar */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => router.back()}
                        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition"
                        title="뒤로 가기"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-slate-900">새 메일 쓰기</h1>
                        <p className="text-xs text-slate-500 mt-0.5">
                            보내는 사람: <span className="font-semibold text-slate-700">{user?.name}</span> ({user?.email})
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={handleSaveDraft}
                        disabled={savingDraft || sending}
                        className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-50 transition"
                    >
                        {savingDraft ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        <span>임시저장</span>
                    </button>

                    <button
                        type="button"
                        onClick={handleSend}
                        disabled={sending || savingDraft}
                        className="flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-2 text-xs font-semibold text-white shadow-md shadow-sky-600/20 hover:bg-sky-500 active:scale-[0.98] disabled:opacity-50 transition"
                    >
                        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        <span>보내기</span>
                    </button>
                </div>
            </div>

            {/* 상태 알림 배너 */}
            {statusMessage && (
                <div
                    className={`flex items-center justify-between rounded-xl p-3.5 text-xs font-medium ${statusMessage.type === 'success'
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
                    <button
                        type="button"
                        onClick={() => setStatusMessage(null)}
                        className="rounded p-0.5 hover:bg-black/5"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                </div>
            )}

            {loadingInitial && (
                <div className="flex items-center justify-center py-6 text-xs text-slate-500 gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-sky-600" />
                    <span>기존 메일 데이터를 불러오는 중...</span>
                </div>
            )}

            {/* Main Mail Form Card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
                {/* Recipients Area */}
                <div className="space-y-1">
                    {/* TO */}
                    <RecipientInput
                        label="받는사람"
                        recipients={to}
                        onChange={setTo}
                        placeholder="수신자 이메일 주소 입력 후 Enter"
                        rightAction={
                            (!showCc || !showBcc) && (
                                <div className="flex items-center gap-2 text-xs">
                                    {!showCc && (
                                        <button
                                            type="button"
                                            onClick={() => setShowCc(true)}
                                            className="font-medium text-slate-500 hover:text-sky-600 transition px-1 py-0.5 rounded hover:bg-slate-100"
                                        >
                                            참조
                                        </button>
                                    )}
                                    {!showBcc && (
                                        <button
                                            type="button"
                                            onClick={() => setShowBcc(true)}
                                            className="font-medium text-slate-500 hover:text-sky-600 transition px-1 py-0.5 rounded hover:bg-slate-100"
                                        >
                                            숨은참조
                                        </button>
                                    )}
                                </div>
                            )
                        }
                    />

                    {/* CC */}
                    {showCc && (
                        <RecipientInput
                            label="참조 (Cc)"
                            recipients={cc}
                            onChange={setCc}
                            placeholder="참조 이메일 주소 입력 후 Enter"
                            rightAction={
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowCc(false);
                                        setCc([]);
                                    }}
                                    className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition"
                                    title="참조 숨기기"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            }
                        />
                    )}

                    {/* BCC */}
                    {showBcc && (
                        <RecipientInput
                            label="숨은참조"
                            recipients={bcc}
                            onChange={setBcc}
                            placeholder="숨은참조 이메일 주소 입력 후 Enter"
                            rightAction={
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowBcc(false);
                                        setBcc([]);
                                    }}
                                    className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition"
                                    title="숨은참조 숨기기"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            }
                        />
                    )}

                    {/* SUBJECT */}
                    <div className="flex items-center gap-3 border-b border-slate-200 py-2.5 px-3 focus-within:border-sky-500 focus-within:bg-sky-50/20 transition-all">
                        <label className="w-20 text-xs font-semibold text-slate-500 uppercase tracking-wider shrink-0">
                            제 목
                        </label>
                        <input
                            type="text"
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            placeholder="메일 제목을 입력하세요"
                            className="flex-1 border-none bg-transparent py-1 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none"
                        />
                        <label
                            className="inline-flex items-center gap-1.5 cursor-pointer select-none px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-amber-50 hover:border-amber-200 transition shrink-0"
                            title="중요 메일로 발송"
                        >
                            <input
                                type="checkbox"
                                checked={isImportant}
                                onChange={(e) => setIsImportant(e.target.checked)}
                                className="h-3.5 w-3.5 rounded border-slate-300 text-amber-500 focus:ring-amber-500 cursor-pointer"
                            />
                            <Star
                                className={`h-3.5 w-3.5 ${
                                    isImportant ? 'fill-amber-400 text-amber-400' : 'text-slate-400'
                                }`}
                            />
                            <span
                                className={`text-xs font-semibold ${
                                    isImportant ? 'text-amber-700' : 'text-slate-600'
                                }`}
                            >
                                중요
                            </span>
                        </label>
                    </div>
                </div>

                {/* 보안 메일 설정 섹션 */}
                <div
                    className={`rounded-xl border transition-all ${
                        isSecure
                            ? 'border-sky-300 bg-sky-50/50 p-4 shadow-xs'
                            : 'border-slate-200 bg-slate-50/60 p-3 hover:border-slate-300'
                    }`}
                >
                    <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2.5 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={isSecure}
                                onChange={(e) => {
                                    setIsSecure(e.target.checked);
                                    if (!e.target.checked) {
                                        setSecurityPassword('');
                                        setSecurityPasswordConfirm('');
                                    }
                                }}
                                className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                            />
                            <div className="flex items-center gap-1.5">
                                <ShieldCheck className={`h-4 w-4 ${isSecure ? 'text-sky-600' : 'text-slate-400'}`} />
                                <span className={`text-xs font-bold ${isSecure ? 'text-sky-950' : 'text-slate-700'}`}>
                                    보안 메일로 발송 (본문 PDF 암호화 및 첨부파일 암호화 압축)
                                </span>
                            </div>
                        </label>
                        {isSecure && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                                <Lock className="h-3 w-3" />
                                <span>암호화 보호 활성</span>
                            </span>
                        )}
                    </div>

                    {isSecure && (
                        <div className="mt-3.5 pt-3.5 border-t border-sky-200/60 space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                        열람 비밀번호 <span className="text-rose-500">* (최소 4자)</span>
                                    </label>
                                    <div className="relative">
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={securityPassword}
                                            onChange={(e) => setSecurityPassword(e.target.value)}
                                            placeholder="수신자가 입력할 비밀번호"
                                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 pr-9"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                            tabIndex={-1}
                                            title={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                                        >
                                            {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                        비밀번호 확인 <span className="text-rose-500">*</span>
                                    </label>
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={securityPasswordConfirm}
                                        onChange={(e) => setSecurityPasswordConfirm(e.target.value)}
                                        placeholder="비밀번호 재입력"
                                        className={`w-full rounded-lg border bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 ${
                                            securityPasswordConfirm && securityPassword !== securityPasswordConfirm
                                                ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500'
                                                : 'border-slate-300 focus:border-sky-500 focus:ring-sky-500'
                                        }`}
                                    />
                                    {securityPasswordConfirm && securityPassword !== securityPasswordConfirm && (
                                        <p className="mt-1 text-[11px] text-rose-600 font-medium">비밀번호가 일치하지 않습니다.</p>
                                    )}
                                </div>
                            </div>

                            <div className="rounded-lg bg-sky-100/70 p-2.5 text-[11px] text-sky-900 leading-relaxed flex items-start gap-2">
                                <span className="text-sky-600 font-bold shrink-0">ℹ️</span>
                                <span>
                                    <strong>안내:</strong> 발송 시 메일 본문은 설정한 암호로 보호된 <strong>[보안메일_본문.pdf]</strong>로 자동 변환되어 첨부되며, 기존 첨부파일은 동일한 암호가 걸린 <strong>[보안메일_첨부파일.zip]</strong>으로 묶여 첨부됩니다. 메일 본문에는 이미지와 함께 열람 안내 문구가 수신자에게 전송됩니다. 수신자는 아웃룩(Outlook) 등 메일 프로그램에서 해당 암호를 입력해야 열람할 수 있습니다.
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Rich Text Editor */}
                <div>
                    <MailEditor
                        value={bodyHtml}
                        onChange={(html, text) => {
                            setBodyHtml(html);
                            setBodyText(text);
                        }}
                        placeholder="메일 본문을 자유롭게 작성하세요..."
                    />
                </div>

                {/* Attachments Section */}
                <div className="pt-2">
                    <AttachmentUploader attachments={attachments} onChange={setAttachments} />
                </div>

                {/* Footer Actions */}
                <div className="flex items-center justify-between border-t border-slate-100 pt-4 mt-6">
                    <button
                        type="button"
                        onClick={() => {
                            if (confirm('작성 중인 내용이 저장되지 않을 수 있습니다. 취소하시겠습니까?')) {
                                router.back();
                            }
                        }}
                        className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition"
                    >
                        작성 취소
                    </button>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleSaveDraft}
                            disabled={savingDraft || sending}
                            className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-50 transition"
                        >
                            {savingDraft ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                            <span>임시저장</span>
                        </button>

                        <button
                            type="button"
                            onClick={handleSend}
                            disabled={sending || savingDraft}
                            className="flex items-center gap-2 rounded-xl bg-sky-600 px-6 py-2.5 text-xs font-semibold text-white shadow-md shadow-sky-600/20 hover:bg-sky-500 active:scale-[0.98] disabled:opacity-50 transition"
                        >
                            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            <span>보내기</span>
                        </button>
                    </div>
                </div>
            </div>
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
