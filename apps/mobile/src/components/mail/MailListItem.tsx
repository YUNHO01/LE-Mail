'use client';

import React from 'react';
import Link from 'next/link';
import { fetchApi } from '@/lib/api';
import { MailMessageDto } from '@lemail/shared-types';
import {
  Mail,
  MailOpen,
  Send,
  Paperclip,
  Trash2,
  MailCheck,
} from 'lucide-react';

interface MailListItemProps {
  mail: MailMessageDto;
  isSent?: boolean;
  onDelete?: (e: React.MouseEvent, mailId: string) => void;
  onToggleRead?: (e: React.MouseEvent, mailId: string, currentIsRead: boolean) => void;
}

export const MailListItem: React.FC<MailListItemProps> = ({
  mail,
  isSent = false,
  onDelete,
  onToggleRead,
}) => {
  const isRead = Boolean(mail.isRead);

  const handleClick = () => {
    if (!isRead) {
      // 읽지 않은 메일을 클릭하여 상세로 진입할 때 즉시 읽음 처리 및 뱃지 카운트 갱신
      fetchApi(`/mails/${mail.id}/read`, {
        method: 'PATCH',
        body: JSON.stringify({ isRead: true }),
      }).catch((err) => console.error('Auto mark read error:', err));
      window.dispatchEvent(new CustomEvent('mail:refresh-folders'));
    }
  };

  return (
    <Link
      href={`/mail/${mail.id}`}
      onClick={handleClick}
      className={`group relative flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 transition-all duration-150 ${
        !isRead
          ? 'bg-white hover:bg-sky-50/40 border-l-4 border-l-sky-500 shadow-[inset_0_1px_0_rgba(241,245,249,0.8)]'
          : 'bg-slate-50/40 hover:bg-slate-100/70 border-l-4 border-l-transparent'
      }`}
    >
      <div className="flex items-center gap-3.5 min-w-0">
        {/* 읽지 않음 인디케이터 도트 */}
        <div className="flex items-center justify-center w-3 shrink-0">
          {!isRead ? (
            <span
              title="읽지 않음"
              className="h-2 w-2 rounded-full bg-sky-500 shadow-sm shadow-sky-500/50"
            />
          ) : (
            <span className="h-2 w-2 rounded-full bg-transparent" />
          )}
        </div>

        {/* 편지봉투 / 전송 아이콘 */}
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition ${
            isSent
              ? 'bg-slate-100 text-slate-500 group-hover:bg-sky-100 group-hover:text-sky-600'
              : !isRead
              ? 'bg-sky-100 text-sky-600 shadow-sm ring-1 ring-sky-200/80 group-hover:bg-sky-200/80'
              : 'bg-slate-100/80 text-slate-400 group-hover:bg-slate-200/70'
          }`}
        >
          {isSent ? (
            <Send className="h-4 w-4" />
          ) : !isRead ? (
            <Mail className="h-4 w-4" />
          ) : (
            <MailOpen className="h-4 w-4" />
          )}
        </div>

        {/* 발신자(또는 수신자) & 제목 & 첨부파일 */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {isSent && <span className="text-xs text-slate-400 shrink-0">받는사람:</span>}
            <span
              className={`text-sm truncate ${
                !isRead ? 'font-bold text-slate-950' : 'font-medium text-slate-600'
              }`}
            >
              {isSent
                ? mail.recipients && mail.recipients.length > 0
                  ? mail.recipients.map((r) => r.address).join(', ')
                  : '(수신자 없음)'
                : mail.sender}
            </span>

            {/* 읽지 않음 전용 뱃지 */}
            {!isRead && (
              <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-700 border border-sky-200 shrink-0">
                안읽음
              </span>
            )}

            {mail.attachments && mail.attachments.length > 0 && (
              <span className="flex items-center gap-0.5 text-[11px] text-slate-400 shrink-0 ml-1">
                <Paperclip className="h-3 w-3" />
                <span>{mail.attachments.length}</span>
              </span>
            )}
          </div>

          <div
            className={`text-sm truncate mt-0.5 ${
              !isRead ? 'font-semibold text-slate-900' : 'font-normal text-slate-500'
            }`}
          >
            {mail.subject || '(제목 없음)'}
          </div>
        </div>
      </div>

      {/* 우측 메타데이터 & 호버 툴바 */}
      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 text-xs text-slate-400">
        <div className="flex items-center gap-1.5">
          {mail.spfResult === 'PASS' && (
            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 border border-emerald-200">
              SPF
            </span>
          )}
          {mail.dkimResult === 'PASS' && (
            <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-600 border border-sky-200">
              DKIM
            </span>
          )}
        </div>

        <span className={!isRead ? 'font-medium text-slate-600' : 'text-slate-400'}>
          {new Date(mail.createdAt).toLocaleString('ko-KR')}
        </span>

        {/* 호버 액션 버튼 (읽음 토글 / 삭제) */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {onToggleRead && (
            <button
              type="button"
              onClick={(e) => onToggleRead(e, mail.id, isRead)}
              title={isRead ? '읽지 않음으로 표시' : '읽음으로 표시'}
              className="p-1.5 rounded-lg text-slate-400 hover:bg-sky-50 hover:text-sky-600 transition"
            >
              {isRead ? (
                <Mail className="h-3.5 w-3.5" />
              ) : (
                <MailCheck className="h-3.5 w-3.5 text-sky-600" />
              )}
            </button>
          )}

          {onDelete && (
            <button
              type="button"
              onClick={(e) => onDelete(e, mail.id)}
              title="메일 삭제"
              className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </Link>
  );
};
