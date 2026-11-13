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
  CheckSquare,
  Square,
} from 'lucide-react';

export const MailboxBackupTab: React.FC = () => {
  const [backups, setBackups] = useState<MailBackupDto[]>([]);
  const [folders, setFolders] = useState<MailFolderDto[]>([]);
  const [backupMode, setBackupMode] = useState<'all' | 'selected'>('all');
  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>([]);
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

  // 계층형 편지함 트리를 플랫 배열로 변환하는 헬퍼 함수 (하위 폴더 포함)
  const flattenFolders = (items: MailFolderDto[], parentName = ''): MailFolderDto[] => {
    let result: MailFolderDto[] = [];
    for (const item of items) {
      const displayName = parentName ? `${parentName} > ${item.name}` : item.name;
      result.push({
        ...item,
        name: displayName,
      });
      if (item.children && item.children.length > 0) {
        result = result.concat(flattenFolders(item.children, displayName));
      }
    }
    return result;
  };

  const loadFolders = async () => {
    try {
      const data = await fetchApi<MailFolderDto[]>('/mail-folders');
      const flatList = flattenFolders(data || []);
      setFolders(flatList);
      // 기본적으로 모든 편지함을 선택 상태로 초기화
      if (flatList.length > 0) {
        setSelectedFolderIds(flatList.map((f) => f.id));
      }
    } catch (err) {
      console.error('편지함 목록 로드 실패:', err);
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

  const toggleFolderSelection = (folderId: string) => {
    setSelectedFolderIds((prev) =>
      prev.includes(folderId) ? prev.filter((id) => id !== folderId) : [...prev, folderId],
    );
  };

  const handleSelectAllFolders = () => {
    setSelectedFolderIds(folders.map((f) => f.id));
  };

  const handleDeselectAllFolders = () => {
    setSelectedFolderIds([]);
  };

  const handleRequestBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (backupMode === 'selected' && selectedFolderIds.length === 0) {
      setMessage({
        type: 'error',
        text: '백업할 메일함을 최소 1개 이상 선택해 주세요.',
      });
      return;
    }

    try {
      setRequesting(true);
      setMessage(null);
      await fetchApi<MailBackupDto>('/mail/backup', {
        method: 'POST',
        body: JSON.stringify({
          folderIds: backupMode === 'all' ? [] : selectedFolderIds,
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
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Archive className="h-4 w-4 text-sky-600" />
            <span>신규 메일함 백업 파일 생성</span>
          </h3>
          <span className="text-xs text-slate-500">
            원하는 백업 범위(전체 또는 개별 편지함)를 선택하여 EML 압축본을 생성합니다.
          </span>
        </div>

        <form onSubmit={handleRequestBackup} className="space-y-4">
          {/* 백업 모드 선택 (전체 vs 선택) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label
              className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition ${
                backupMode === 'all'
                  ? 'border-sky-500 bg-sky-50/40 text-slate-900 ring-1 ring-sky-500'
                  : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
              }`}
            >
              <input
                type="radio"
                name="backupMode"
                value="all"
                checked={backupMode === 'all'}
                onChange={() => setBackupMode('all')}
                className="mt-0.5 text-sky-600 focus:ring-sky-500"
              />
              <div className="space-y-0.5">
                <span className="text-xs font-bold block">전체 메일함 백업</span>
                <span className="text-[11px] text-slate-500 block">
                  받은편지함, 보낸편지함, 임시보관함 등 모든 편지함의 메일을 일괄 압축합니다.
                </span>
              </div>
            </label>

            <label
              className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition ${
                backupMode === 'selected'
                  ? 'border-sky-500 bg-sky-50/40 text-slate-900 ring-1 ring-sky-500'
                  : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
              }`}
            >
              <input
                type="radio"
                name="backupMode"
                value="selected"
                checked={backupMode === 'selected'}
                onChange={() => setBackupMode('selected')}
                className="mt-0.5 text-sky-600 focus:ring-sky-500"
              />
              <div className="space-y-0.5">
                <span className="text-xs font-bold block">메일함 선택적 백업</span>
                <span className="text-[11px] text-slate-500 block">
                  백업하고 싶은 특정 편지함들을 직접 체크하여 선택한 메일만 백업합니다.
                </span>
              </div>
            </label>
          </div>

          {/* 메일함 직접 선택 모드일 때 편지함 체크박스 리스트 */}
          {backupMode === 'selected' && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-700">
                    백업할 편지함 선택 ({selectedFolderIds.length}개 선택됨)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSelectAllFolders}
                    className="text-[11px] font-medium text-sky-600 hover:text-sky-700 hover:underline"
                  >
                    전체 선택
                  </button>
                  <span className="text-slate-300 text-xs">|</span>
                  <button
                    type="button"
                    onClick={handleDeselectAllFolders}
                    className="text-[11px] font-medium text-slate-500 hover:text-slate-700 hover:underline"
                  >
                    전체 해제
                  </button>
                </div>
              </div>

              {folders.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400">
                  불러올 수 있는 편지함 목록이 없습니다.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-56 overflow-y-auto pr-1">
                  {folders.map((f) => {
                    const isChecked = selectedFolderIds.includes(f.id);
                    return (
                      <div
                        key={f.id}
                        onClick={() => toggleFolderSelection(f.id)}
                        className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer select-none text-xs transition ${
                          isChecked
                            ? 'bg-white border-sky-300 shadow-sm text-sky-950 font-medium'
                            : 'bg-white/60 border-slate-200 text-slate-600 hover:bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-2 overflow-hidden mr-2">
                          {isChecked ? (
                            <CheckSquare className="h-4 w-4 text-sky-600 flex-shrink-0" />
                          ) : (
                            <Square className="h-4 w-4 text-slate-300 flex-shrink-0" />
                          )}
                          <Folder className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                          <span className="truncate" title={f.name}>
                            {f.name}
                          </span>
                        </div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 flex-shrink-0">
                          {f.totalCount ?? 0}통
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 백업 실행 버튼 영역 */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1 border-t border-slate-100">
            <div className="text-xs text-slate-500">
              {backupMode === 'all' ? (
                <span>전체 편지함의 메일이 ZIP 파일로 압축됩니다.</span>
              ) : (
                <span>
                  선택한 <strong>{selectedFolderIds.length}개</strong>의 편지함 메일이 압축됩니다.
                </span>
              )}
            </div>

            <button
              type="submit"
              disabled={requesting || (backupMode === 'selected' && selectedFolderIds.length === 0)}
              className="h-10 px-6 w-full sm:w-auto rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-sm transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
          <div className="divide-y divide-slate-100">
            {backups.map((b) => {
              const isAvailable = b.status === BackupStatus.COMPLETED && b.downloadUrl;
              const isExpired = b.status === BackupStatus.EXPIRED;

              return (
                <div key={b.id} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Folder className="h-4 w-4 text-[#007AFF] flex-shrink-0" />
                      <span className="text-sm font-bold text-slate-900 truncate">
                        {b.folderName}
                      </span>
                    </div>
                    <div className="flex-shrink-0">{getStatusBadge(b.status)}</div>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span>{b.totalCount.toLocaleString()}통</span>
                    <span>·</span>
                    <span>{formatFileSize(b.fileSizeBytes)}</span>
                    <span>·</span>
                    <span>생성 {b.createdAt ? b.createdAt.slice(0, 16).replace('T', ' ') : '-'}</span>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span
                      className={`text-[11px] ${
                        isExpired ? 'text-slate-400 line-through' : 'text-amber-700 font-medium'
                      }`}
                    >
                      만료 {b.expiresAt ? b.expiresAt.slice(0, 16).replace('T', ' ') : '-'}
                    </span>

                    {isAvailable ? (
                      <a
                        href={b.downloadUrl}
                        download
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#007AFF] px-3.5 py-2 text-xs font-semibold text-white shadow-sm active:scale-95 transition"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>다운로드</span>
                      </a>
                    ) : isExpired ? (
                      <span className="text-[11px] text-slate-400">다운로드 불가</span>
                    ) : b.status === BackupStatus.PROCESSING || b.status === BackupStatus.PENDING ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#007AFF]">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>압축 중</span>
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium text-rose-500">실패</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
