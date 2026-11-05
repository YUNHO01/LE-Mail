'use client';

import React, { useEffect, useState } from 'react';
import { fetchApi } from '@/lib/api';
import { MailboxDto } from '@lemail/shared-types';
import { Users, Plus, Search, Trash2, Check, X, RefreshCw } from 'lucide-react';

export default function MailboxesPage() {
  const [mailboxes, setMailboxes] = useState<MailboxDto[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // 모달 상태
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [creating, setCreating] = useState(false);

  const loadMailboxes = async () => {
    try {
      setLoading(true);
      const res = await fetchApi<{ items: MailboxDto[]; total: number }>(
        `/mailboxes?search=${encodeURIComponent(search)}&limit=50`,
      );
      setMailboxes(res.items);
      setTotal(res.total);
    } catch (err: any) {
      alert(err.message || '사서함 목록 조회 실패');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMailboxes();
  }, [search]);

  const handleToggleActive = async (mailbox: MailboxDto) => {
    try {
      await fetchApi(`/mailboxes/${mailbox.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !mailbox.isActive }),
      });
      loadMailboxes();
    } catch (err: any) {
      alert(err.message || '상태 변경 실패');
    }
  };

  const handleDelete = async (id: string, email: string) => {
    if (!confirm(`사서함 '${email}'을 정말 삭제하시겠습니까?`)) return;
    try {
      await fetchApi(`/mailboxes/${id}`, { method: 'DELETE' });
      loadMailboxes();
    } catch (err: any) {
      alert(err.message || '삭제 실패');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.includes('@')) {
      alert('올바른 이메일 주소를 입력해 주세요.');
      return;
    }
    try {
      setCreating(true);
      await fetchApi('/mailboxes', {
        method: 'POST',
        body: JSON.stringify({ email: newEmail.trim() }),
      });
      setIsModalOpen(false);
      setNewEmail('');
      loadMailboxes();
    } catch (err: any) {
      alert(err.message || '사서함 생성 실패');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">사서함 및 도메인 관리</h1>
          <p className="text-sm text-slate-500">인바운드 메일 수신이 허용되는 활성 사서함을 등록하고 관리합니다.</p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-500 transition"
        >
          <Plus className="h-4 w-4" />
          <span>신규 사서함 등록</span>
        </button>
      </div>

      {/* Search & Stats Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="이메일 검색..."
            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-4 text-sm outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500"
          />
        </div>
        <div className="text-xs text-slate-500 font-medium">
          총 <span className="font-bold text-slate-800">{total}</span>개의 등록된 사서함
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-6 py-3">이메일 주소</th>
              <th className="px-6 py-3">도메인</th>
              <th className="px-6 py-3">상태</th>
              <th className="px-6 py-3">등록일시</th>
              <th className="px-6 py-3 text-right">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {mailboxes.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-400">
                  {loading ? '사서함을 불러오는 중...' : '등록된 사서함이 없습니다.'}
                </td>
              </tr>
            ) : (
              mailboxes.map((mb) => (
                <tr key={mb.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-6 py-4 font-medium text-slate-900">{mb.email}</td>
                  <td className="px-6 py-4 text-slate-500">{mb.domain}</td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleToggleActive(mb)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition ${
                        mb.isActive
                          ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-300'
                      }`}
                    >
                      {mb.isActive ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                      <span>{mb.isActive ? 'Active (수신 허용)' : 'Disabled (차단)'}</span>
                    </button>
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-400">
                    {new Date(mb.createdAt).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleDelete(mb.id, mb.email)}
                      className="rounded p-1 text-slate-400 hover:text-rose-600 transition"
                      title="사서함 삭제"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-2">신규 사서함 등록</h3>
            <p className="text-xs text-slate-500 mb-4">
              등록된 사서함은 즉시 인메모리/Redis 캐시에 동기화되어 메일 수신이 허용됩니다.
            </p>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  이메일 주소
                </label>
                <input
                  type="email"
                  required
                  placeholder="user@yourdomain.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 transition disabled:opacity-50"
                >
                  {creating ? '등록 중...' : '등록하기'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
