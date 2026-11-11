'use client';

import React, { useEffect, useState, useRef } from 'react';
import { fetchApi } from '@/lib/api';
import { MailBackupDto, BackupStatus, MailFolderDto } from '@lemail/shared-types';
import {
  Archive,
  Download,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileArchive,
  Loader2,
  Folder,
  Calendar,
  HardDrive,
  Info,
} from 'lucide-react';

export const MailboxBackupTab: React.FC = () => {
  const [backups, setBackups] = useState<MailBackupDto[]>([]);
  const [folders, setFolders] = useState<MailFolderDto[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>(''); // 빈 문자열 = 전체 메일함
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadInitialData();
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      await Promise.all([loadBackups(), loadFolders()]);
    } finally {
      setLoading(false);
    }
  };

  const loadFolders = async () => {
    try {
      const data = await fetchApi<MailFolderDto[]>('/folders');
      setFolders(data || []);
    } catch (_) {
      // 폴더 로드 실패 시 무시하고 전체 메일함 백업만 허용
    }
  };

  const loadBackups = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const data = await fetchApi<MailBackupDto[]>('/mail/backup');
      const list = data || [];
      setBackups(list);

      // 진행 중인 작업이 있으면 3초 폴링 활성화
      const hasActive = list.some(
        (b) => b.status === BackupStatus.PENDING || b.status === BackupStatus.PROCESSING,
      );

      if (hasActive) {
        if (!pollingRef.current) {
          pollingRef.current = setInterval(() => {
            loadBackups(true);
          }, 3000);
        }
      } else {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      }
    } catch (err: any) {
      if (!silent) {
        setMessage({
          type: 'error',
          text: err.message || '백업 목록을 불러오지 못했습니다.',
        });
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleRequestBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setRequesting(true);
      setMessage(null);
      await fetchApi<MailBackupDto>('/mail/backup', {
        method: 'POST',
        body: JSON.stringify({
          folderId: selectedFolderId.trim() ? selectedFolderId : null,
        }),
      });

      setMessage({
        type: 'success',
        text: '메일함 백업 압축 생성이 시작되었습니다. 완료 시 다운로드 링크가 제공됩니다.',
      });

      loadBackups();
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err.message || '백업 요청 중 오류가 발생했습니다.',
      });
    } finally {
      setRequesting(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes || bytes <= 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getStatusBadge = (status: BackupStatus) => {
    switch (status) {
      case BackupStatus.PENDING:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="h-3 w-3 animate-spin" />
            대기 중
          </span>
        );
      case BackupStatus.PROCESSING:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
            <Loader2 className="h-3 w-3 animate-spin" />
            압축 생성 중
          </span>
        );
      case BackupStatus.COMPLETED:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="h-3 w-3" />
            완료됨
          </span>
        );
      case BackupStatus.EXPIRED:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200">
            기간 만료 (삭제됨)
          </span>
        );
      case BackupStatus.FAILED:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <AlertCircle className="h-3 w-3" />
            생성 실패
          </span>
        );
      default:
        return <span className="text-[10px] text-slate-400">{status}</span>;
    }
  };

  return (
    <div className="space-y-6 w-full">
      <div>
        <h2 className="text-base font-bold tracking-tight text-slate-900">메일함 데이터 백업</h2>
        <p className="text-xs text-slate-500 mt-1">
          사서함의 메일들을 표준 EML 형식의 압축 파일(.zip)로 백업하고 다운로드합니다.
        </p>
      </div>

      {/* 안내 알림 배너 */}
      <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4 flex items-start gap-3 text-xs text-sky-900">
        <Info className="h-4 w-4 text-sky-600 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-semibold">백업 압축 파일 보관 및 자동 삭제 정책</div>
          <p className="text-sky-800 leading-relaxed">
            백업 파일은 서버에서 비동기로 안전하게 압축 생성되며 완료 시 즉시 다운로드 링크가 제공됩니다.
            서버 스토리지 보호를 위해 <strong>생성일로부터 7일 후 백업 파일은 서버에서 자동 영구 삭제</strong>되므로 기한 내에 다운로드하여 안전한 로컬 저장소에 보관해 주시기 바랍니다.
          </p>
        </div>
      </div>

      {/* 상태 메시지 배너 */}
      {message && (
        <div
          className={`rounded-2xl p-4 flex items-center gap-3 text-xs border ${
            message.type === 'success'
              ? 'bg-emerald-50/80 border-emerald-200 text-emerald-800'
              : 'bg-rose-50/80 border-rose-200 text-rose-800'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 text-rose-600 flex-shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* 백업 요청 폼 카드 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Archive className="h-4 w-4 text-sky-600" />
          <span>신규 메일함 백업 파일 생성</span>
        </h3>

        <form onSubmit={handleRequestBackup} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
          <div className="sm:col-span-8">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              백업 대상 편지함 선택
            </label>
            <select
              value={selectedFolderId}
              onChange={(e) => setSelectedFolderId(e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 bg-white text-slate-800"
            >
              <option value="">전체 메일함 (모든 편지함 및 사용자 폴더 통합 백업)</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.totalCount ?? 0}통)
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-4">
            <button
              type="submit"
              disabled={requesting}
              className="h-10 w-full rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-sm transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {requesting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>백업 생성 요청 중...</span>
                </>
              ) : (
                <>
                  <FileArchive className="h-3.5 w-3.5" />
                  <span>백업 파일 생성 시작</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* 백업 이력 및 다운로드 목록 카드 */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileArchive className="h-4 w-4 text-slate-600" />
            <span className="text-xs font-bold text-slate-800">
              백업 파일 및 다운로드 링크 목록 ({backups.length}건)
            </span>
          </div>

          <button
            type="button"
            onClick={() => loadBackups()}
            disabled={loading}
            className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
            title="목록 새로고침"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {loading && backups.length === 0 ? (
          <div className="py-16 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
            <span>백업 목록을 불러오는 중입니다...</span>
          </div>
        ) : backups.length === 0 ? (
          <div className="py-16 text-center text-xs text-slate-400">
            생성된 백업 내역이 없습니다. 상단에서 백업 생성을 요청해 보세요.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-xs">
              <thead className="bg-slate-50 text-slate-500 font-semibold">
                <tr>
                  <th className="px-4 py-3 text-left">백업 대상</th>
                  <th className="px-4 py-3 text-center">진행 상태</th>
                  <th className="px-4 py-3 text-right">메일 건수</th>
                  <th className="px-4 py-3 text-right">파일 크기</th>
                  <th className="px-4 py-3 text-left">생성 일시</th>
                  <th className="px-4 py-3 text-left">만료 예정일</th>
                  <th className="px-4 py-3 text-right">다운로드</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {backups.map((b) => {
                  const isAvailable = b.status === BackupStatus.COMPLETED && b.downloadUrl;
                  const isExpired = b.status === BackupStatus.EXPIRED;

                  return (
                    <tr key={b.id} className="hover:bg-slate-50/60 transition">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                          <Folder className="h-3.5 w-3.5 text-sky-500" />
                          <span>{b.folderName}</span>
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-center">
                        {getStatusBadge(b.status)}
                      </td>

                      <td className="px-4 py-3.5 text-right font-mono text-slate-700">
                        {b.totalCount.toLocaleString()}통
                      </td>

                      <td className="px-4 py-3.5 text-right font-mono text-slate-700">
                        {formatFileSize(b.fileSizeBytes)}
                      </td>

                      <td className="px-4 py-3.5 text-slate-500 text-[11px]">
                        {b.createdAt ? b.createdAt.slice(0, 16).replace('T', ' ') : '-'}
                      </td>

                      <td className="px-4 py-3.5 text-[11px]">
                        <span
                          className={
                            isExpired
                              ? 'text-slate-400 line-through'
                              : 'text-amber-700 font-medium'
                          }
                        >
                          {b.expiresAt ? b.expiresAt.slice(0, 16).replace('T', ' ') : '-'}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        {isAvailable ? (
                          <a
                            href={b.downloadUrl}
                            download
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs shadow-sm transition"
                          >
                            <Download className="h-3 w-3" />
                            <span>다운로드</span>
                          </a>
                        ) : isExpired ? (
                          <span className="text-slate-400 text-[11px]">다운로드 불가</span>
                        ) : b.status === BackupStatus.PROCESSING || b.status === BackupStatus.PENDING ? (
                          <span className="text-sky-600 text-[11px] font-medium flex items-center justify-end gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            압축 중
                          </span>
                        ) : (
                          <span className="text-rose-500 text-[11px]">실패</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
