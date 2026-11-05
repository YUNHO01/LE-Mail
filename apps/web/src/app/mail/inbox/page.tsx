'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchApi } from '@/lib/api';
import { MailMessageDto } from '@lemail/shared-types';
import { Inbox, Paperclip, Search, ShieldCheck, Trash2, Mail as MailIcon } from 'lucide-react';

export default function MailInboxPage() {
  const [mails, setMails] = useState<MailMessageDto[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const loadMails = async () => {
    try {
      setLoading(true);
      const res = await fetchApi<{ items: MailMessageDto[]; total: number }>(
        `/mails?search=${encodeURIComponent(search)}&limit=50`,
      );
      setMails(res.items);
      setTotal(res.total);
    } catch (err: any) {
      console.error('메일 목록 조회 오류:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMails();
  }, [search]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('이 메일을 삭제하시겠습니까?')) return;
    try {
      await fetchApi(`/mails/${id}`, { method: 'DELETE' });
      loadMails();
    } catch (err: any) {
      alert(err.message || '메일 삭제 실패');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Inbox className="h-6 w-6 text-sky-600" />
            <span>받은편지함</span>
          </h1>
          <p className="text-sm text-slate-500">수신된 이메일 목록을 열람하고 첨부파일을 다운로드합니다.</p>
        </div>

        <div className="text-xs text-slate-500 font-medium">
          총 <span className="font-bold text-slate-900">{total}</span>개의 메일
        </div>
      </div>

      {/* Filter Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="제목, 발신자 검색..."
            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-4 text-sm outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500"
          />
        </div>
      </div>

      {/* Mail List */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {mails.length === 0 ? (
          <div className="py-12 text-center text-slate-400">
            <MailIcon className="mx-auto h-12 w-12 text-slate-300 mb-2" />
            <p>{loading ? '메일을 불러오는 중...' : '받은 메일이 없습니다.'}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {mails.map((mail) => (
              <Link
                key={mail.id}
                href={`/mail/${mail.id}`}
                className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 hover:bg-sky-50/50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 group-hover:bg-sky-100 group-hover:text-sky-600 transition">
                    <MailIcon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900 text-sm truncate">{mail.sender}</span>
                      {mail.attachments && mail.attachments.length > 0 && (
                        <span className="flex items-center gap-0.5 text-[11px] text-slate-400">
                          <Paperclip className="h-3 w-3" />
                          <span>{mail.attachments.length}</span>
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-slate-600 truncate mt-0.5 font-medium">
                      {mail.subject || '(제목 없음)'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 flex-shrink-0 text-xs text-slate-400 sm:self-center self-end">
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                    {mail.status}
                  </span>
                  <span>{new Date(mail.createdAt).toLocaleDateString()}</span>
                  <button
                    onClick={(e) => handleDelete(e, mail.id)}
                    className="p-1 text-slate-400 hover:text-rose-600 transition"
                    title="메일 삭제"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
