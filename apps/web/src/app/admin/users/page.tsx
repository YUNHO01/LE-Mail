'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import {
  Users,
  UserPlus,
  Search,
  Shield,
  Key,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Mail,
  RefreshCw,
  Lock,
} from 'lucide-react';
import { UserDto, UserRole } from '@lemail/shared-types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:9200';

export default function UsersManagementPage() {
  const { token, user: currentUser, isAdmin } = useAuth();

  const [users, setUsers] = useState<UserDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [targetUser, setTargetUser] = useState<UserDto | null>(null);

  // Form states
  const [formData, setFormData] = useState<{
    email: string;
    name: string;
    password: string;
    role: UserRole;
  }>({
    email: '',
    name: '',
    password: '',
    role: UserRole.USER,
  });
  const [newPassword, setNewPassword] = useState('');

  // Alert message
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (roleFilter) params.append('role', roleFilter);

      const res = await fetch(`${API_BASE_URL}/api/users?${params.toString()}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          setMessage({
            type: 'error',
            text: '시스템 관리자 권한이 필요합니다. 먼저 관리자 계정으로 로그인해 주세요.',
          });
        }
        setUsers([]);
        return;
      }

      const data = await res.json();
      setUsers(data.items || []);
      setTotal(data.total || 0);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || '사용자 목록을 불러오는 중 오류가 발생했습니다.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [token, roleFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchUsers();
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || '사용자 등록 실패');
      }

      setMessage({
        type: 'success',
        text: `사용자 '${data.email}' 등록 완료! 전용 사서함이 함께 생성되었습니다.`,
      });
      setIsCreateModalOpen(false);
      setFormData({ email: '', name: '', password: '', role: UserRole.USER });
      fetchUsers();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleToggleActive = async (target: UserDto) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/users/${target.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ isActive: !target.isActive }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || '상태 변경 실패');
      }

      setMessage({
        type: 'success',
        text: `'${target.name}' 사용자의 활성 상태를 변경했습니다.`,
      });
      fetchUsers();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUser) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/users/${targetUser.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ password: newPassword }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || '비밀번호 변경 실패');
      }

      setMessage({
        type: 'success',
        text: `'${targetUser.name}' 사용자의 비밀번호가 안전하게 변경되었습니다.`,
      });
      setIsPasswordModalOpen(false);
      setNewPassword('');
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleDeleteUser = async (target: UserDto) => {
    if (!confirm(`'${target.name} (${target.email})' 사용자를 정말 삭제하시겠습니까?\n사서함도 함께 비활성화됩니다.`)) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/users/${target.id}`, {
        method: 'DELETE',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || '삭제 실패');
      }

      setMessage({ type: 'success', text: data.message || '사용자가 성공적으로 삭제되었습니다.' });
      fetchUsers();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">사용자 계정 관리</h1>
          <p className="mt-1 text-sm text-slate-500">
            시스템 관리자 및 일반 사용자 계정을 관리하고 전용 사서함을 자동으로 프로비저닝합니다.
          </p>
        </div>

        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 transition"
        >
          <UserPlus className="h-4 w-4" />
          <span>신규 사용자 등록</span>
        </button>
      </div>

      {/* Alert Banner */}
      {message && (
        <div
          className={`flex items-center justify-between rounded-lg p-4 text-sm ${
            message.type === 'success'
              ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {message.type === 'success' ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            ) : (
              <AlertCircle className="h-5 w-5 text-rose-600" />
            )}
            <span>{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="text-xs font-semibold hover:underline">
            닫기
          </button>
        </div>
      )}

      {/* Filters & Search */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <form onSubmit={handleSearchSubmit} className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="이름 또는 이메일 계정 검색..."
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500"
          />
        </form>

        <div className="flex items-center gap-3">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-sky-500"
          >
            <option value="">모든 권한</option>
            <option value={UserRole.SYSTEM_ADMIN}>시스템 관리자</option>
            <option value={UserRole.USER}>일반 사용자</option>
          </select>

          <button
            onClick={fetchUsers}
            title="새로고침"
            className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 transition"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Users Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-6 py-3.5">사용자 정보</th>
              <th className="px-6 py-3.5">역할</th>
              <th className="px-6 py-3.5">계정 상태</th>
              <th className="px-6 py-3.5">최종 로그인</th>
              <th className="px-6 py-3.5">등록일</th>
              <th className="px-6 py-3.5 text-right">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-400">
                  <div className="flex items-center justify-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin text-sky-600" />
                    <span>사용자 목록을 불러오는 중...</span>
                  </div>
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-400">
                  등록된 사용자가 없습니다.
                </td>
              </tr>
            ) : (
              users.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 font-semibold text-slate-700">
                        {item.name ? item.name.slice(0, 1) : 'U'}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900">{item.name}</div>
                        <div className="flex items-center gap-1 text-xs text-slate-500">
                          <Mail className="h-3 w-3 text-slate-400" />
                          <span>{item.email}</span>
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="px-6 py-4">
                    {item.role === UserRole.SYSTEM_ADMIN ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200">
                        <Shield className="h-3 w-3" />
                        <span>시스템 관리자</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-700 border border-sky-200">
                        <span>일반 사용자</span>
                      </span>
                    )}
                  </td>

                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleToggleActive(item)}
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition ${
                        item.isActive
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                          : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      {item.isActive ? (
                        <>
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                          <span>활성</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="h-3 w-3 text-slate-400" />
                          <span>비활성</span>
                        </>
                      )}
                    </button>
                  </td>

                  <td className="px-6 py-4 text-xs text-slate-500">
                    {item.lastLoginAt
                      ? new Date(item.lastLoginAt).toLocaleString('ko-KR')
                      : '미접속'}
                  </td>

                  <td className="px-6 py-4 text-xs text-slate-500">
                    {new Date(item.createdAt).toLocaleDateString('ko-KR')}
                  </td>

                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => {
                          setTargetUser(item);
                          setIsPasswordModalOpen(true);
                        }}
                        title="비밀번호 변경"
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                      >
                        <Key className="h-4 w-4" />
                      </button>

                      <button
                        onClick={() => handleDeleteUser(item)}
                        disabled={currentUser?.id === item.id}
                        title={currentUser?.id === item.id ? '본인 계정 삭제 불가' : '계정 삭제'}
                        className={`rounded-lg p-1.5 transition ${
                          currentUser?.id === item.id
                            ? 'text-slate-200 cursor-not-allowed'
                            : 'text-slate-400 hover:bg-rose-50 hover:text-rose-600'
                        }`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal: 신규 사용자 등록 */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-slate-900">신규 사용자 등록</h3>
            <p className="mt-1 text-xs text-slate-500">
              사용자를 생성하면 로그인 계정 및 전용 사서함(Mailbox)이 자동으로 구성됩니다.
            </p>

            <form onSubmit={handleCreateUser} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700">이메일 주소</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="user@lineedge.com"
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">이름</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="홍길동"
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">초기 비밀번호</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="최소 6자 이상"
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">계정 권한</label>
                <select
                  value={formData.role}
                  onChange={(e) =>
                    setFormData({ ...formData, role: e.target.value as UserRole })
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm outline-none focus:border-sky-500"
                >
                  <option value={UserRole.USER}>일반 사용자 (USER)</option>
                  <option value={UserRole.SYSTEM_ADMIN}>시스템 관리자 (SYSTEM_ADMIN)</option>
                </select>
              </div>

              <div className="rounded-lg bg-sky-50 p-3 text-xs text-sky-800 border border-sky-100">
                💡 <b>자동 사서함 연동</b>: 등록 즉시 도메인을 판별하여 사서함이 활성화되며, 외부 발신자로부터 해당 주소로 메일을 수신할 수 있습니다.
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 transition"
                >
                  등록 완료
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: 비밀번호 변경 */}
      {isPasswordModalOpen && targetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-slate-900">비밀번호 재설정</h3>
            <p className="mt-1 text-xs text-slate-500">
              대상 사용자: <span className="font-semibold text-slate-700">{targetUser.name} ({targetUser.email})</span>
            </p>

            <form onSubmit={handleChangePassword} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700">새 비밀번호</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="최소 6자 이상"
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                />
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsPasswordModalOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 transition"
                >
                  비밀번호 변경
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
