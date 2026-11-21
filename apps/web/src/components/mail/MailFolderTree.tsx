'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { fetchApi } from '@/lib/api';
import { fetchMailFoldersCached } from '@/lib/mail-folders-cache';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigation } from '@/contexts/NavigationContext';
import { MailFolderDto, FolderType } from '@lemail/shared-types';
import {
  Inbox,
  Send,
  FileEdit,
  ShieldAlert,
  Trash2,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Plus,
  Trash,
} from 'lucide-react';

interface MailFolderTreeProps {
  onSelectFolder?: () => void;
}

export const MailFolderTree: React.FC<MailFolderTreeProps> = ({ onSelectFolder }) => {
  const pathname = usePathname();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { startNavigation } = useNavigation();
  const [folders, setFolders] = useState<MailFolderDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  // 모달 상태 (새 폴더 생성)
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [targetParentFolder, setTargetParentFolder] = useState<MailFolderDto | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [creating, setCreating] = useState(false);

  // 드래그 앤 드롭 이동 상태
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [dropToast, setDropToast] = useState<string | null>(null);
  const autoExpandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (autoExpandTimerRef.current) clearTimeout(autoExpandTimerRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const showDropToast = (message: string) => {
    setDropToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setDropToast(null);
    }, 2600);
  };

  const clearAutoExpandTimer = () => {
    if (autoExpandTimerRef.current) {
      clearTimeout(autoExpandTimerRef.current);
      autoExpandTimerRef.current = null;
    }
  };

  const isMailDragEvent = (e: React.DragEvent) =>
    Array.from(e.dataTransfer?.types || []).includes('application/x-lemail-mail-ids');

  const handleFolderDragOver = (
    e: React.DragEvent,
    targetFolder?: MailFolderDto,
  ) => {
    if (!targetFolder || !isMailDragEvent(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';

    if (dragOverFolderId !== targetFolder.id) {
      setDragOverFolderId(targetFolder.id);
      clearAutoExpandTimer();
      const hasChildren = Boolean(targetFolder.children && targetFolder.children.length > 0);
      if (hasChildren && !expandedFolders[targetFolder.id]) {
        autoExpandTimerRef.current = setTimeout(() => {
          setExpandedFolders((prev) => ({ ...prev, [targetFolder.id]: true }));
        }, 600);
      }
    }
  };

  const handleFolderDragLeave = (
    e: React.DragEvent,
    targetFolder?: MailFolderDto,
  ) => {
    if (!targetFolder) return;
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    clearAutoExpandTimer();
    setDragOverFolderId((prev) => (prev === targetFolder.id ? null : prev));
  };

  const handleFolderDrop = async (
    e: React.DragEvent,
    targetFolder?: MailFolderDto,
  ) => {
    if (!targetFolder || !isMailDragEvent(e)) return;
    e.preventDefault();
    e.stopPropagation();
    clearAutoExpandTimer();
    setDragOverFolderId(null);

    const raw = e.dataTransfer.getData('application/x-lemail-mail-ids');
    if (!raw) return;

    let ids: string[] = [];
    let sourceFolderId: string | null = null;
    try {
      const parsed = JSON.parse(raw);
      ids = Array.isArray(parsed?.ids) ? parsed.ids : [];
      sourceFolderId = parsed?.sourceFolderId ?? null;
    } catch {
      return;
    }

    if (ids.length === 0 || sourceFolderId === targetFolder.id) return;

    try {
      if (ids.length === 1) {
        await fetchApi(`/mails/${ids[0]}/move`, {
          method: 'PATCH',
          body: JSON.stringify({ targetFolderId: targetFolder.id }),
        });
      } else {
        await fetchApi('/mails/bulk-move', {
          method: 'POST',
          body: JSON.stringify({ ids, targetFolderId: targetFolder.id }),
        });
      }

      window.dispatchEvent(
        new CustomEvent('mail:moved', {
          detail: { ids, targetFolderId: targetFolder.id },
        }),
      );
      window.dispatchEvent(new CustomEvent('mail:refresh-folders'));
      showDropToast(
        ids.length === 1
          ? `메일을 [${targetFolder.name}] 편지함으로 이동했습니다.`
          : `${ids.length}개의 메일을 [${targetFolder.name}] 편지함으로 이동했습니다.`,
      );
    } catch (err: any) {
      alert(err?.message || '편지함 이동에 실패했습니다.');
    }
  };

  const loadFolders = async () => {
    if (!isAuthenticated) return;
    try {
      setLoading(true);
      const res = await fetchMailFoldersCached();
      setFolders(res || []);

      // 개인편지함(CUSTOM)은 기본적으로 펼쳐둠
      const customFolder = (res || []).find((f) => f.type === FolderType.CUSTOM);
      if (customFolder) {
        setExpandedFolders((prev) => ({
          ...prev,
          [customFolder.id]: prev[customFolder.id] !== undefined ? prev[customFolder.id] : true,
        }));
      }
    } catch (err) {
      console.error('편지함 목록 로드 실패:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      loadFolders();
    }

    const handleRefresh = () => {
      loadFolders();
    };

    window.addEventListener('mail:refresh-folders', handleRefresh);
    window.addEventListener('focus', handleRefresh);
    return () => {
      window.removeEventListener('mail:refresh-folders', handleRefresh);
      window.removeEventListener('focus', handleRefresh);
    };
  }, [isAuthenticated, authLoading, pathname]);

  const toggleExpand = (folderId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setExpandedFolders((prev) => ({
      ...prev,
      [folderId]: !prev[folderId],
    }));
  };

  const openCreateModal = (parent: MailFolderDto, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setTargetParentFolder(parent);
    setNewFolderName('');
    setCreateModalOpen(true);
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    try {
      setCreating(false);
      await fetchApi('/mail-folders', {
        method: 'POST',
        body: JSON.stringify({
          name: newFolderName.trim(),
          parentId: targetParentFolder ? targetParentFolder.id : null,
        }),
      });
      setCreateModalOpen(false);
      setNewFolderName('');
      // 상위 폴더 펼치기
      if (targetParentFolder) {
        setExpandedFolders((prev) => ({
          ...prev,
          [targetParentFolder.id]: true,
        }));
      }
      await loadFolders();
    } catch (err: any) {
      alert(err.message || '편지함 생성에 실패했습니다.');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteFolder = async (folder: MailFolderDto, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (folder.isSystem) return;

    if (
      !confirm(
        `[${folder.name}] 편지함을 삭제하시겠습니까?\n소속된 메일은 휴지통으로 이동합니다.`,
      )
    ) {
      return;
    }

    try {
      await fetchApi(`/mail-folders/${folder.id}`, { method: 'DELETE' });
      await loadFolders();
    } catch (err: any) {
      alert(err.message || '편지함 삭제에 실패했습니다.');
    }
  };

  // 시스템 기본 편지함 6종 찾기
  const inbox = folders.find((f) => f.type === FolderType.INBOX);
  const sent = folders.find((f) => f.type === FolderType.SENT);
  const drafts = folders.find((f) => f.type === FolderType.DRAFTS);
  const spam = folders.find((f) => f.type === FolderType.SPAM);
  const trash = folders.find((f) => f.type === FolderType.TRASH);
  const customRoot = folders.find((f) => f.type === FolderType.CUSTOM);

  const isLinkActive = (path: string) => {
    return pathname === path || pathname?.startsWith(`${path}/`);
  };

  // 재귀적 하위 편지함 렌더링 컴포넌트
  const renderTreeNodes = (nodes: MailFolderDto[], depth = 1) => {
    if (!nodes || nodes.length === 0) return null;

    return (
      <div className="space-y-0.5">
        {nodes.map((node) => {
          const hasChildren = node.children && node.children.length > 0;
          const isExpanded = !!expandedFolders[node.id];
          const active = pathname === `/mail/folder/${node.id}`;
          const isDragOver = dragOverFolderId === node.id;

          return (
            <div key={node.id}>
              <div
                onDragOver={(e) => handleFolderDragOver(e, node)}
                onDragLeave={(e) => handleFolderDragLeave(e, node)}
                onDrop={(e) => handleFolderDrop(e, node)}
                className={`group flex items-center justify-between rounded-lg px-2 py-1.5 min-h-[28px] text-xs font-medium transition-colors ${
                  isDragOver
                    ? 'bg-[#007aff]/15 ring-2 ring-[#0071e3] text-[#0071e3] font-semibold'
                    : active
                    ? 'bg-[#007aff]/12 text-[#0071e3] font-semibold'
                    : 'text-[#1d1d1f] hover:bg-black/[0.04]'
                }`}
                style={{ paddingLeft: `${depth * 14 + 10}px` }}
              >
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  {hasChildren ? (
                    <button
                      type="button"
                      onClick={(e) => toggleExpand(node.id, e)}
                      className="p-0.5 text-[#86868b] hover:text-[#1d1d1f] rounded"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                    </button>
                  ) : (
                    <span className="w-3.5" />
                  )}

                  <Link
                    href={`/mail/folder/${node.id}`}
                    onClick={() => {
                      onSelectFolder?.();
                      startNavigation(`/mail/folder/${node.id}`);
                    }}
                    onMouseDown={() => startNavigation(`/mail/folder/${node.id}`)}
                    className="flex items-center gap-1.5 truncate flex-1"
                  >
                    {isExpanded ? (
                      <FolderOpen className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-[#0071e3]' : 'text-[#86868b]'}`} />
                    ) : (
                      <Folder className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-[#0071e3]' : 'text-[#86868b]'}`} />
                    )}
                    <span className="truncate">{node.name}</span>
                  </Link>
                </div>

                <div className="flex items-center gap-1 shrink-0 ml-1">
                  {node.unreadCount !== undefined && node.unreadCount > 0 && (
                    <span className={`text-[11px] tabular-nums font-semibold ${active ? 'text-[#0071e3]' : 'text-[#86868b]'}`}>
                      {node.unreadCount}
                    </span>
                  )}

                  {/* 호버 시 액션 버튼 */}
                  <div className="hidden group-hover:flex items-center gap-0.5 h-4">
                    <button
                      type="button"
                      title="하위 편지함 추가"
                      onClick={(e) => openCreateModal(node, e)}
                      className="p-0.5 rounded text-[#86868b] hover:text-[#1d1d1f] hover:bg-black/[0.06]"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                    {!node.isSystem && (
                      <button
                        type="button"
                        title="편지함 삭제"
                        onClick={(e) => handleDeleteFolder(node, e)}
                        className="p-0.5 rounded text-[#86868b] hover:text-[#ff3b30] hover:bg-[#ff3b30]/10"
                      >
                        <Trash className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* 자식 노드 재귀 렌더링 */}
              {hasChildren && isExpanded && renderTreeNodes(node.children!, depth + 1)}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* 1~6 기본 편지함 일체형 목록 */}
      <div>
        <nav className="space-y-0.5">
          {/* 1. 받은편지함 */}
          <Link
            href="/mail/inbox"
            onClick={() => {
              onSelectFolder?.();
              startNavigation('/mail/inbox');
            }}
            onMouseDown={() => startNavigation('/mail/inbox')}
            onDragOver={(e) => handleFolderDragOver(e, inbox)}
            onDragLeave={(e) => handleFolderDragLeave(e, inbox)}
            onDrop={(e) => handleFolderDrop(e, inbox)}
            className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
              inbox && dragOverFolderId === inbox.id
                ? 'bg-[#007aff]/15 ring-2 ring-[#0071e3] text-[#0071e3] font-semibold'
                : isLinkActive('/mail/inbox')
                ? 'bg-[#007aff]/12 text-[#0071e3] font-semibold'
                : 'text-[#1d1d1f] hover:bg-black/[0.04]'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Inbox className={`h-4 w-4 ${isLinkActive('/mail/inbox') ? 'text-[#0071e3]' : 'text-[#6e6e73]'}`} />
              <span>받은편지함</span>
            </div>
            {inbox?.unreadCount !== undefined && inbox.unreadCount > 0 && (
              <span className={`text-[11px] tabular-nums font-semibold ${isLinkActive('/mail/inbox') ? 'text-[#0071e3]' : 'text-[#86868b]'}`}>
                {inbox.unreadCount}
              </span>
            )}
          </Link>

          {/* 2. 보낸편지함 */}
          <Link
            href="/mail/sent"
            onClick={() => {
              onSelectFolder?.();
              startNavigation('/mail/sent');
            }}
            onMouseDown={() => startNavigation('/mail/sent')}
            onDragOver={(e) => handleFolderDragOver(e, sent)}
            onDragLeave={(e) => handleFolderDragLeave(e, sent)}
            onDrop={(e) => handleFolderDrop(e, sent)}
            className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
              sent && dragOverFolderId === sent.id
                ? 'bg-[#007aff]/15 ring-2 ring-[#0071e3] text-[#0071e3] font-semibold'
                : isLinkActive('/mail/sent')
                ? 'bg-[#007aff]/12 text-[#0071e3] font-semibold'
                : 'text-[#1d1d1f] hover:bg-black/[0.04]'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Send className={`h-4 w-4 ${isLinkActive('/mail/sent') ? 'text-[#0071e3]' : 'text-[#6e6e73]'}`} />
              <span>보낸편지함</span>
            </div>
            {sent?.unreadCount !== undefined && sent.unreadCount > 0 && (
              <span className={`text-[11px] tabular-nums font-semibold ${isLinkActive('/mail/sent') ? 'text-[#0071e3]' : 'text-[#86868b]'}`}>
                {sent.unreadCount}
              </span>
            )}
          </Link>

          {/* 3. 임시보관함 */}
          <Link
            href="/mail/drafts"
            onClick={() => {
              onSelectFolder?.();
              startNavigation('/mail/drafts');
            }}
            onMouseDown={() => startNavigation('/mail/drafts')}
            onDragOver={(e) => handleFolderDragOver(e, drafts)}
            onDragLeave={(e) => handleFolderDragLeave(e, drafts)}
            onDrop={(e) => handleFolderDrop(e, drafts)}
            className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
              drafts && dragOverFolderId === drafts.id
                ? 'bg-[#007aff]/15 ring-2 ring-[#0071e3] text-[#0071e3] font-semibold'
                : isLinkActive('/mail/drafts')
                ? 'bg-[#007aff]/12 text-[#0071e3] font-semibold'
                : 'text-[#1d1d1f] hover:bg-black/[0.04]'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <FileEdit className={`h-4 w-4 ${isLinkActive('/mail/drafts') ? 'text-[#0071e3]' : 'text-[#6e6e73]'}`} />
              <span>임시보관함</span>
            </div>
            {drafts?.unreadCount !== undefined && drafts.unreadCount > 0 && (
              <span className={`text-[11px] tabular-nums font-semibold ${isLinkActive('/mail/drafts') ? 'text-[#0071e3]' : 'text-[#86868b]'}`}>
                {drafts.unreadCount}
              </span>
            )}
          </Link>

          {/* 4. 스팸메일함 */}
          <Link
            href="/mail/spam"
            onClick={() => {
              onSelectFolder?.();
              startNavigation('/mail/spam');
            }}
            onMouseDown={() => startNavigation('/mail/spam')}
            onDragOver={(e) => handleFolderDragOver(e, spam)}
            onDragLeave={(e) => handleFolderDragLeave(e, spam)}
            onDrop={(e) => handleFolderDrop(e, spam)}
            className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
              spam && dragOverFolderId === spam.id
                ? 'bg-[#007aff]/15 ring-2 ring-[#0071e3] text-[#0071e3] font-semibold'
                : isLinkActive('/mail/spam')
                ? 'bg-[#007aff]/12 text-[#0071e3] font-semibold'
                : 'text-[#1d1d1f] hover:bg-black/[0.04]'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <ShieldAlert className={`h-4 w-4 ${isLinkActive('/mail/spam') ? 'text-[#0071e3]' : 'text-[#ff9500]'}`} />
              <span>스팸메일함</span>
            </div>
            {spam?.unreadCount !== undefined && spam.unreadCount > 0 && (
              <span className={`text-[11px] tabular-nums font-semibold ${isLinkActive('/mail/spam') ? 'text-[#0071e3]' : 'text-[#ff9500]'}`}>
                {spam.unreadCount}
              </span>
            )}
          </Link>

          {/* 5. 휴지통 */}
          <Link
            href="/mail/trash"
            onClick={() => {
              onSelectFolder?.();
              startNavigation('/mail/trash');
            }}
            onMouseDown={() => startNavigation('/mail/trash')}
            onDragOver={(e) => handleFolderDragOver(e, trash)}
            onDragLeave={(e) => handleFolderDragLeave(e, trash)}
            onDrop={(e) => handleFolderDrop(e, trash)}
            className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
              trash && dragOverFolderId === trash.id
                ? 'bg-[#007aff]/15 ring-2 ring-[#0071e3] text-[#0071e3] font-semibold'
                : isLinkActive('/mail/trash')
                ? 'bg-[#007aff]/12 text-[#0071e3] font-semibold'
                : 'text-[#1d1d1f] hover:bg-black/[0.04]'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Trash2 className={`h-4 w-4 ${isLinkActive('/mail/trash') ? 'text-[#0071e3]' : 'text-[#6e6e73]'}`} />
              <span>휴지통</span>
            </div>
            {trash?.unreadCount !== undefined && trash.unreadCount > 0 && (
              <span className={`text-[11px] tabular-nums font-semibold ${isLinkActive('/mail/trash') ? 'text-[#0071e3]' : 'text-[#86868b]'}`}>
                {trash.unreadCount}
              </span>
            )}
          </Link>

          {/* 6. 개인편지함 (트리 루트 및 하위 편지함 관리) */}
          <div className="pt-2 mt-2 border-t border-black/[0.06]">
            <div
              onDragOver={(e) => handleFolderDragOver(e, customRoot)}
              onDragLeave={(e) => handleFolderDragLeave(e, customRoot)}
              onDrop={(e) => handleFolderDrop(e, customRoot)}
              className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-[13px] font-medium transition-colors ${
                customRoot && dragOverFolderId === customRoot.id
                  ? 'bg-[#007aff]/15 ring-2 ring-[#0071e3] text-[#0071e3] font-semibold'
                  : customRoot && pathname === `/mail/folder/${customRoot.id}`
                  ? 'bg-[#007aff]/12 text-[#0071e3] font-semibold'
                  : 'text-[#1d1d1f] hover:bg-black/[0.04]'
              }`}
            >
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <button
                  type="button"
                  title="하위 편지함 펼치기/접기"
                  onClick={(e) => customRoot && toggleExpand(customRoot.id, e)}
                  className="p-0.5 text-[#86868b] hover:text-[#1d1d1f] rounded"
                >
                  {customRoot && expandedFolders[customRoot.id] ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                </button>

                <Link
                  href={customRoot ? `/mail/folder/${customRoot.id}` : '#'}
                  onClick={() => {
                    onSelectFolder?.();
                    if (customRoot) startNavigation(`/mail/folder/${customRoot.id}`);
                  }}
                  onMouseDown={() => {
                    if (customRoot) startNavigation(`/mail/folder/${customRoot.id}`);
                  }}
                  className="flex items-center gap-2 flex-1 truncate"
                >
                  {customRoot && expandedFolders[customRoot.id] ? (
                    <FolderOpen className="h-4 w-4 text-[#86868b] shrink-0" />
                  ) : (
                    <Folder className="h-4 w-4 text-[#86868b] shrink-0" />
                  )}
                  <span className="truncate">개인편지함</span>
                </Link>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {customRoot?.unreadCount !== undefined && customRoot.unreadCount > 0 && (
                  <span className="text-[11px] tabular-nums font-semibold text-[#86868b] mr-1">
                    {customRoot.unreadCount}
                  </span>
                )}
                {customRoot && (
                  <button
                    type="button"
                    title="새 하위 편지함 만들기"
                    onClick={(e) => openCreateModal(customRoot, e)}
                    className="p-1 rounded text-[#86868b] hover:text-[#0071e3] hover:bg-black/[0.05] transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* 개인편지함 하위 트리 목록 */}
            {customRoot && expandedFolders[customRoot.id] && (
              <div className="mt-0.5 space-y-0.5">
                {customRoot.children && customRoot.children.length > 0 ? (
                  renderTreeNodes(customRoot.children, 1)
                ) : (
                  <div className="pl-8 pr-3 py-1.5 text-xs text-[#86868b]">
                    하위 편지함 없음 (+ 버튼 클릭)
                  </div>
                )}
              </div>
            )}
          </div>
        </nav>
      </div>

      {/* 새 편지함 생성 모달 */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white border border-slate-200 p-6 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 mb-1">새 편지함 만들기</h3>
            <p className="text-xs text-slate-500 mb-4">
              상위 편지함: <span className="text-sky-600 font-semibold">{targetParentFolder?.name}</span>
            </p>

            <form onSubmit={handleCreateFolder}>
              <div className="mb-5">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  편지함 이름
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="예: 프로젝트 A, 영수증"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className="w-full rounded-lg bg-slate-50 border border-slate-200 px-3.5 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="rounded-lg px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={creating || !newFolderName.trim()}
                  className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-50 transition"
                >
                  {creating ? '생성 중...' : '만들기'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 드래그 앤 드롭 이동 완료 토스트 */}
      {dropToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 rounded-xl bg-[#1d1d1f] px-4 py-2.5 text-xs font-medium text-white shadow-xl"
        >
          {dropToast}
        </div>
      )}
    </div>
  );
};
