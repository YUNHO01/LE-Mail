'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { fetchApi } from '@/lib/api';
import { MailMessageDto } from '@lemail/shared-types';
import {
  ArrowLeft,
  Download,
  Paperclip,
  Trash2,
  ShieldCheck,
  FileText,
  User,
  Clock,
} from 'lucide-react';

export default function MailDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [mail, setMail] = useState<MailMessageDto | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const loadMail = async () => {
      try {
        setLoading(true);
        const data = await fetchApi<MailMessageDto>(`/mails/${id}`);
        setMail(data);
      } catch (err: any) {
        alert(err.message || '메일을 불러올 수 없습니다.');
        router.push('/mail/inbox');
      } finally {
        setLoading(false);
      }
    };
    loadMail();
  }, [id, router]);

  const handleDelete = async () => {
    if (!confirm('이 메일을 정말 삭제하시겠습니까?')) return;
    try {
      await fetchApi(`/mails/${id}`, { method: 'DELETE' });
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
          <a
            href={`/api/mails/${mail.id}/raw`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
            <span>원본 EML 다운로드</span>
          </a>

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
          <h1 className="text-xl font-bold text-slate-900">
            {mail.subject || '(제목 없음)'}
          </h1>

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
            <span className="text-slate-500 font-semibold">인증 상태:</span>
            <span className="rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
              SPF: {mail.spfResult}
            </span>
            <span className="rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
              DKIM: {mail.dkimResult}
            </span>
            <span className="rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
              DMARC: {mail.dmarcResult}
            </span>
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
              dangerouslySetInnerHTML={{ __html: mail.body.html }}
            />
          ) : mail.body?.text ? (
            <pre className="whitespace-pre-wrap font-sans text-sm text-slate-800">
              {mail.body.text}
            </pre>
          ) : (
            <p className="text-sm italic text-slate-400">본문 내용이 없습니다.</p>
          )}
        </div>
      </div>
    </div>
  );
}
