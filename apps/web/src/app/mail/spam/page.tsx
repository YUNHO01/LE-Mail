'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fetchApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { MailMessageDto, MailFolderDto, FolderType } from '@lemail/shared-types';
import { ShieldAlert, LogIn, AlertCircle } from 'lucide-react';
import { MailDataTable } from '@/components/mail/MailDataTable';

export default function MailSpamPage() {
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
      // SPAM 편지함 찾기
      const folders = await fetchApi<MailFolderDto[]>('/mail-folders');
      const spamFolder = (folders || []).find((f) => f.type === FolderType.SPAM);

      if (spamFolder) {
        const queryParams = new URLSearchParams({
          folderId: spamFolder.id,
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
      console.error('스팸메일함 조회 오류:', err);
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

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('이 스팸 메일을 삭제하시겠습니까?')) return;
    try {
      await fetchApi(`/mails/${id}`, { method: 'DELETE' });
      await loadMails();
      window.dispatchEvent(new CustomEvent('mail:refresh-folders'));
    } catch (err: any) {
      alert(err.message || '삭제 실패');
    }
  };

  const handleToggleRead = async (
    e: React.MouseEvent,
    id: string,
    currentIsRead: boolean,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const nextRead = !currentIsRead;
      await fetchApi(`/mails/${id}/read`, {
        method: 'PATCH',
        body: JSON.stringify({ isRead: nextRead }),
      });
      setMails((prev) =>
        prev.map((m) => (m.id === id ? { ...m, isRead: nextRead } : m)),
      );
      window.dispatchEvent(new CustomEvent('mail:refresh-folders'));
    } catch (err: any) {
      alert(err.message || '읽음 상태 변경 실패');
    }
  };

  const handleBulkDelete = async (ids: string[]) => {
    if (!confirm(`선택한 ${ids.length}개의 스팸 메일을 삭제하시겠습니까?`)) return;
    try {
      await Promise.all(ids.map((id) => fetchApi(`/mails/${id}`, { method: 'DELETE' })));
      await loadMails();
      window.dispatchEvent(new CustomEvent('mail:refresh-folders'));
    } catch (err: any) {
      alert(err.message || '일괄 삭제 실패');
    }
  };

  const handleBulkToggleRead = async (ids: string[], targetIsRead: boolean) => {
    try {
      await Promise.all(
        ids.map((id) =>
          fetchApi(`/mails/${id}/read`, {
            method: 'PATCH',
            body: JSON.stringify({ isRead: targetIsRead }),
          })
        )
      );
      setMails((prev) =>
        prev.map((m) => (ids.includes(m.id) ? { ...m, isRead: targetIsRead } : m))
      );
      window.dispatchEvent(new CustomEvent('mail:refresh-folders'));
    } catch (err: any) {
      alert(err.message || '일괄 읽음 상태 변경 실패');
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
          스팸메일함을 확인하시려면 먼저 계정으로 로그인해 주세요.
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
          <ShieldAlert className="h-6 w-6 text-amber-500" />
          <span>스팸메일함</span>
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          보안 인증(SPF/DKIM/DMARC) 실패 또는 스팸으로 분류된 메일 목록입니다.
        </p>
      </div>

      {/* Mail Data Table */}
      <MailDataTable
        mails={mails}
        total={total}
        loading={loading}
        type="spam"
        search={search}
        onSearchChange={setSearch}
        onDelete={handleDelete}
        onToggleRead={handleToggleRead}
        onBulkDelete={handleBulkDelete}
        onBulkToggleRead={handleBulkToggleRead}
        onRefresh={loadMails}
        emptyMessage="스팸메일함이 비어 있습니다."
        emptySubMessage="격리되거나 스팸으로 분류된 메일이 없습니다."
      />
    </div>
  );
}
