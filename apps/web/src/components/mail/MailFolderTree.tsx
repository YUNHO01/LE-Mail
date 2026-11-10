'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { fetchApi } from '@/lib/api';
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

  const loadFolders = async () => {
    if (!isAuthenticated) return;
    try {
      setLoading(true);
      const res = await fetchApi<MailFolderDto[]>('/mail-folders');
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

          return (
            <div key={node.id} className="group">
              <div
                className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
                style={{ paddingLeft: `${depth * 14 + 10}px` }}
              >
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  {hasChildren ? (
                    <button
                      type="button"
                      onClick={(e) => toggleExpand(node.id, e)}
                      className="p-0.5 text-slate-400 hover:text-white rounded"
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
                      <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                    ) : (
                      <Folder className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                    )}
                    <span className="truncate">{node.name}</span>
                  </Link>
                </div>

                <div className="flex items-center gap-1 shrink-0 ml-1">
                  {node.unreadCount !== undefined && node.unreadCount > 0 && (
                    <span className="rounded-full bg-sky-500/20 px-1.5 py-0.2 text-[10px] font-bold text-sky-400">
                      {node.unreadCount}
                    </span>
                  )}

                  {/* 호버 시 액션 버튼 */}
                  <div className="hidden group-hover:flex items-center gap-0.5">
                    <button
                      title="하위 편지함 추가"
                      onClick={(e) => openCreateModal(node, e)}
                      className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-700"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                    {!node.isSystem && (
                      <button
                        title="편지함 삭제"
                        onClick={(e) => handleDeleteFolder(node, e)}
                        className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-700"
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
        <div className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          기본 편지함
        </div>
        <nav className="space-y-1">
          {/* 1. 받은편지함 */}
          <Link
            href="/mail/inbox"
            onClick={() => {
              onSelectFolder?.();
              startNavigation('/mail/inbox');
            }}
            onMouseDown={() => startNavigation('/mail/inbox')}
            className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isLinkActive('/mail/inbox')
                ? 'bg-sky-600 text-white'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-3">
              <Inbox className="h-4 w-4" />
              <span>받은편지함</span>
            </div>
            {inbox?.unreadCount !== undefined && inbox.unreadCount > 0 && (
              <span className="rounded-full bg-sky-400 px-2 py-0.5 text-xs font-bold text-slate-900">
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
            className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isLinkActive('/mail/sent')
                ? 'bg-sky-600 text-white'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-3">
              <Send className="h-4 w-4" />
              <span>보낸편지함</span>
            </div>
            {sent?.unreadCount !== undefined && sent.unreadCount > 0 && (
              <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-xs font-semibold text-sky-400 border border-sky-500/30">
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
            className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isLinkActive('/mail/drafts')
                ? 'bg-sky-600 text-white'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-3">
              <FileEdit className="h-4 w-4" />
              <span>임시보관함</span>
            </div>
            {drafts?.unreadCount !== undefined && drafts.unreadCount > 0 && (
              <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-300 border border-slate-700">
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
            className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isLinkActive('/mail/spam')
                ? 'bg-sky-600 text-white'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-3">
              <ShieldAlert className="h-4 w-4 text-amber-400" />
              <span>스팸메일함</span>
            </div>
            {spam?.unreadCount !== undefined && spam.unreadCount > 0 && (
              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-400 border border-amber-500/30">
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
            className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isLinkActive('/mail/trash')
                ? 'bg-sky-600 text-white'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-3">
              <Trash2 className="h-4 w-4" />
              <span>휴지통</span>
            </div>
            {trash?.unreadCount !== undefined && trash.unreadCount > 0 && (
              <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-400 border border-slate-700">
                {trash.unreadCount}
              </span>
            )}
          </Link>

          {/* 6. 개인편지함 (트리 루트 및 하위 편지함 관리) */}
          <div className="pt-1">
            <div
              className={`flex items-center justify-between rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
                customRoot && pathname === `/mail/folder/${customRoot.id}`
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <button
                  type="button"
                  title="하위 편지함 펼치기/접기"
                  onClick={(e) => customRoot && toggleExpand(customRoot.id, e)}
                  className="p-0.5 text-slate-400 hover:text-white rounded"
                >
                  {customRoot && expandedFolders[customRoot.id] ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
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
                    <FolderOpen className="h-4 w-4 text-amber-400 shrink-0" />
                  ) : (
                    <Folder className="h-4 w-4 text-amber-400 shrink-0" />
                  )}
                  <span className="truncate">개인편지함</span>
                </Link>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {customRoot?.unreadCount !== undefined && customRoot.unreadCount > 0 && (
                  <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-xs font-semibold text-sky-400 border border-sky-500/30 mr-1">
                    {customRoot.unreadCount}
                  </span>
                )}
                {customRoot && (
                  <button
                    type="button"
                    title="새 하위 편지함 만들기"
                    onClick={(e) => openCreateModal(customRoot, e)}
                    className="p-1 rounded text-slate-400 hover:text-sky-400 hover:bg-slate-700/60 transition-colors"
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
                  <div className="pl-9 pr-3 py-1.5 text-xs text-slate-500 italic">
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
    </div>
  );
};
