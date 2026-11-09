'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fetchApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { MailMessageDto, MailFolderDto, FolderType } from '@lemail/shared-types';
import { Trash2, LogIn, AlertCircle } from 'lucide-react';
import { MailDataTable } from '@/components/mail/MailDataTable';

export default function MailTrashPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  const [mails, setMails] = useState<MailMessageDto[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const loadMails = async () => {
    if (!isAuthenticated || !user?.email) {
      setMails([]);
      setTotal(0);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      // TRASH 편지함 찾기
      const folders = await fetchApi<MailFolderDto[]>('/mail-folders');
      const trashFolder = (folders || []).find((f) => f.type === FolderType.TRASH);

      if (trashFolder) {
        const queryParams = new URLSearchParams({
          folderId: trashFolder.id,
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
      } else {
        setMails([]);
        setTotal(0);
      }
    } catch (err: any) {
      console.error('휴지통 조회 오류:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      loadMails();
    }

    const handleRefresh = () => {
      loadMails();
    };

    window.addEventListener('mail:refresh-folders', handleRefresh);
    window.addEventListener('focus', handleRefresh);
    return () => {
      window.removeEventListener('mail:refresh-folders', handleRefresh);
      window.removeEventListener('focus', handleRefresh);
    };
  }, [search, user?.email, isAuthenticated, authLoading]);

  const handleDeletePermanent = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('이 메일을 영구히 삭제하시겠습니까? 복구할 수 없습니다.')) return;
    try {
      await fetchApi(`/mails/${id}`, { method: 'DELETE' });
      loadMails();
      window.dispatchEvent(new CustomEvent('mail:refresh-folders'));
    } catch (err: any) {
      alert(err.message || '삭제 실패');
    }
  };

  const handleBulkDelete = async (ids: string[]) => {
    if (!confirm(`선택한 ${ids.length}개의 메일을 영구 삭제하시겠습니까? 복구할 수 없습니다.`)) return;
    try {
      await Promise.all(ids.map((id) => fetchApi(`/mails/${id}`, { method: 'DELETE' })));
      loadMails();
      window.dispatchEvent(new CustomEvent('mail:refresh-folders'));
    } catch (err: any) {
      alert(err.message || '일괄 삭제 실패');
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
          휴지통을 확인하시려면 먼저 계정으로 로그인해 주세요.
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
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
          <Trash2 className="h-6 w-6 text-slate-600" />
          <span>휴지통</span>
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          삭제된 메일 목록입니다. 휴지통에서 삭제 시 영구 삭제됩니다.
        </p>
      </div>

      {/* Mail Data Table */}
      <MailDataTable
        mails={mails}
        total={total}
        loading={loading}
        type="trash"
        search={search}
        onSearchChange={setSearch}
        onDelete={handleDeletePermanent}
        onBulkDelete={handleBulkDelete}
        onRefresh={loadMails}
        emptyMessage="휴지통이 비어 있습니다."
        emptySubMessage="삭제된 메일이 없습니다."
      />
    </div>
  );
}
