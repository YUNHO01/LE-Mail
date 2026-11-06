'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { fetchApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { MailMessageDto, MailFolderDto } from '@lemail/shared-types';
import {
  FolderOpen,
  Paperclip,
  Search,
  Trash2,
  Mail as MailIcon,
  LogIn,
  AlertCircle,
} from 'lucide-react';

export default function FolderMailsPage() {
  const router = useRouter();
  const params = useParams();
  const folderId = params?.id as string;
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  const [folder, setFolder] = useState<MailFolderDto | null>(null);
  const [mails, setMails] = useState<MailMessageDto[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    if (!isAuthenticated || !folderId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // 전체 편지함 트리에서 현재 폴더 정보 찾기
      const folders = await fetchApi<MailFolderDto[]>('/mail-folders');
      const findFolder = (list: MailFolderDto[]): MailFolderDto | null => {
        for (const f of list) {
          if (f.id === folderId) return f;
          if (f.children && f.children.length > 0) {
            const found = findFolder(f.children);
            if (found) return found;
          }
        }
        return null;
      };
      const current = findFolder(folders || []);
      setFolder(current);

      // 메일 목록 로드
      const queryParams = new URLSearchParams({
        folderId,
        limit: '50',
      });
      if (search.trim()) {
        queryParams.append('search', search.trim());
      }

      const res = await fetchApi<{ items: MailMessageDto[]; total: number }>(
        `/mails?${queryParams.toString()}`,
      );
      setMails(res.items || []);
      setTotal(res.total || 0);
    } catch (err: any) {
      console.error('편지함 메일 조회 오류:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      loadData();
    }
  }, [folderId, search, isAuthenticated, authLoading]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('이 메일을 삭제하시겠습니까?')) return;
    try {
      await fetchApi(`/mails/${id}`, { method: 'DELETE' });
      loadData();
    } catch (err: any) {
      alert(err.message || '메일 삭제 실패');
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
          개인 편지함을 확인하시려면 먼저 계정으로 로그인해 주세요.
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

  const folderName = folder ? folder.name : '개인편지함';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <FolderOpen className="h-6 w-6 text-amber-500" />
              <span>{folderName}</span>
            </h1>
            {user?.email && (
              <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-700 border border-sky-200">
                {user.email}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {folderName} 편지함에 보관된 메일 목록입니다.
          </p>
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
        {loading ? (
          <div className="py-16 text-center text-slate-400">
            <MailIcon className="mx-auto h-12 w-12 text-slate-300 animate-pulse mb-3" />
            <p className="text-sm">메일을 불러오는 중...</p>
          </div>
        ) : mails.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <MailIcon className="mx-auto h-12 w-12 text-slate-300 mb-3" />
            <p className="text-sm font-medium text-slate-600">보관된 메일이 없습니다.</p>
            <p className="text-xs text-slate-400 mt-1">
              이 편지함으로 이동된 메일이 이곳에 표시됩니다.
            </p>
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
                    <div className="text-sm font-medium text-slate-700 truncate mt-0.5">
                      {mail.subject || '(제목 없음)'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 flex-shrink-0 text-xs text-slate-400">
                  <span>{new Date(mail.createdAt).toLocaleString('ko-KR')}</span>
                  <button
                    onClick={(e) => handleDelete(e, mail.id)}
                    title="메일 삭제"
                    className="p-1 rounded text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
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
