'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Bell,
  BellOff,
  CheckCircle2,
  Loader2,
  Send,
  Smartphone,
  Trash2,
} from 'lucide-react';
import type { PushSubscriptionItem } from '@lemail/shared-types';
import { pushApi } from '@/lib/api';
import { ToggleSwitch } from '@/components/common';
import {
  getCurrentBrowserPushEndpoint,
  isIosSafariNotInstalled,
  isPushSupported,
  subscribeCurrentBrowserPush,
  unsubscribeCurrentBrowserPush,
} from '@/lib/push';

export const NotificationSettingsTab: React.FC = () => {
  const [supported, setSupported] = useState(true);
  const [iosNeedsInstall, setIosNeedsInstall] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [currentEndpoint, setCurrentEndpoint] = useState<string | null>(null);

  const [pushEnabled, setPushEnabled] = useState(true);
  const [pushPreviewEnabled, setPushPreviewEnabled] = useState(true);
  const [subscriptions, setSubscriptions] = useState<PushSubscriptionItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [updatingField, setUpdatingField] = useState<'pushEnabled' | 'pushPreviewEnabled' | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadState = useCallback(async () => {
    try {
      setLoading(true);
      const isSupported = isPushSupported();
      setSupported(isSupported);
      setIosNeedsInstall(isIosSafariNotInstalled());

      if (typeof Notification !== 'undefined') {
        setPermission(Notification.permission);
      }

      const [endpoint, serverState] = await Promise.all([
        getCurrentBrowserPushEndpoint(),
        pushApi.getSettingsAndSubscriptions(),
      ]);

      setCurrentEndpoint(endpoint);
      setPushEnabled(serverState.pushEnabled);
      setPushPreviewEnabled(serverState.pushPreviewEnabled);
      setSubscriptions(serverState.subscriptions);
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err?.message || '알림 설정을 불러오지 못했습니다.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadState();
  }, [loadState]);

  const currentSubscription = subscriptions.find((s) => s.endpoint === currentEndpoint) || null;

  const handleSubscribeThisDevice = async () => {
    setMessage(null);
    setBusy(true);
    try {
      const saved = await subscribeCurrentBrowserPush();
      setPermission(typeof Notification !== 'undefined' ? Notification.permission : 'granted');
      setCurrentEndpoint(saved.endpoint);
      setSubscriptions((prev) => [
        saved,
        ...prev.filter((item) => item.id !== saved.id && item.endpoint !== saved.endpoint),
      ]);
      setMessage({ type: 'success', text: '현재 기기에 Web Push 알림이 등록되었습니다.' });
    } catch (err: any) {
      if (typeof Notification !== 'undefined') {
        setPermission(Notification.permission);
      }
      setMessage({
        type: 'error',
        text: err?.message || '알림 구독 등록에 실패했습니다.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleUnsubscribeThisDevice = async () => {
    if (!currentSubscription) return;
    setMessage(null);
    setBusy(true);
    try {
      await unsubscribeCurrentBrowserPush();
      await pushApi.removeSubscription(currentSubscription.id);
      setCurrentEndpoint(null);
      setSubscriptions((prev) => prev.filter((item) => item.id !== currentSubscription.id));
      setMessage({ type: 'success', text: '현재 기기의 Web Push 알림 구독을 해제했습니다.' });
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err?.message || '구독 해제에 실패했습니다.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveSubscription = async (sub: PushSubscriptionItem) => {
    setMessage(null);
    setBusy(true);
    try {
      if (sub.endpoint === currentEndpoint) {
        await unsubscribeCurrentBrowserPush();
        setCurrentEndpoint(null);
      }
      await pushApi.removeSubscription(sub.id);
      setSubscriptions((prev) => prev.filter((item) => item.id !== sub.id));
      setMessage({ type: 'success', text: '선택한 기기의 알림 구독을 삭제했습니다.' });
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err?.message || '구독 삭제에 실패했습니다.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleToggleSetting = async (
    field: 'pushEnabled' | 'pushPreviewEnabled',
    nextValue: boolean,
  ) => {
    if (updatingField) return;
    setMessage(null);
    setUpdatingField(field);
    try {
      const updated = await pushApi.updateSettings({ [field]: nextValue });
      setPushEnabled(updated.pushEnabled);
      setPushPreviewEnabled(updated.pushPreviewEnabled);
      setMessage({ type: 'success', text: '알림 설정이 저장되었습니다.' });
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err?.message || '설정 변경에 실패했습니다.',
      });
    } finally {
      setUpdatingField(null);
    }
  };

  const handleTestPush = async () => {
    setMessage(null);
    setTesting(true);
    try {
      const res = await pushApi.sendTestNotification();
      if (res.sent > 0) {
        setMessage({
          type: 'success',
          text: `${res.sent}개 기기로 테스트 알림을 발송했습니다.`,
        });
      } else {
        setMessage({
          type: 'error',
          text: '발송 가능한 등록 기기가 없습니다. 먼저 이 기기를 등록해 주세요.',
        });
      }
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err?.message || '테스트 알림 발송에 실패했습니다.',
      });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="py-12 text-center text-xs text-slate-400">
        알림 설정을 불러오는 중입니다...
      </div>
    );
  }

  const permissionLabelMap: Record<NotificationPermission, string> = {
    granted: '허용됨',
    denied: '차단됨',
    default: '미설정',
  };

  return (
    <div className="space-y-6 rounded-2xl border border-black/[0.08] bg-white p-6 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-black/[0.06] pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0071e3]/10 text-[#0071e3]">
            {currentSubscription ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
          </div>
          <div>
            <h3 className="text-base font-bold text-[#1d1d1f]">Web Push 알림 설정</h3>
            <p className="text-xs text-[#6e6e73]">
              새 메일 도착 시 현재 브라우저 또는 모바일 PWA로 실시간 푸시 알림을 수신합니다.
              {' · '}권한: <span className="font-semibold text-[#1d1d1f]">{permissionLabelMap[permission] || permission}</span>
              {' · '}상태:{' '}
              <span className={currentSubscription ? 'font-semibold text-[#248a3d]' : 'text-[#6e6e73]'}>
                {currentSubscription ? '구독 중' : '미등록'}
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {currentSubscription ? (
            <>
              <button
                type="button"
                onClick={handleTestPush}
                disabled={testing || busy}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-black/[0.1] bg-white px-3.5 text-xs font-semibold text-[#1d1d1f] hover:bg-black/[0.03] disabled:opacity-50 transition"
              >
                {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5 text-[#0071e3]" />}
                <span>테스트 알림</span>
              </button>
              <button
                type="button"
                onClick={handleUnsubscribeThisDevice}
                disabled={busy}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#ff3b30]/25 bg-[#ff3b30]/[0.06] px-3.5 text-xs font-semibold text-[#ff3b30] hover:bg-[#ff3b30]/12 disabled:opacity-50 transition"
              >
                <BellOff className="h-3.5 w-3.5" />
                <span>이 기기 알림 끄기</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleSubscribeThisDevice}
              disabled={busy || !supported}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#0071e3] px-4 text-xs font-semibold text-white shadow-xs hover:bg-[#0062c4] disabled:opacity-50 transition"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />}
              <span>이 기기에서 알림 받기</span>
            </button>
          )}
        </div>
      </div>

      {message && (
        <div
          className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-xs font-medium ${
            message.type === 'success'
              ? 'border-[#34c759]/30 bg-[#34c759]/10 text-[#248a3d]'
              : 'border-[#ff3b30]/25 bg-[#ff3b30]/[0.06] text-[#d70015]'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {permission === 'denied' && (
        <div className="rounded-xl border border-[#ff9500]/30 bg-[#ff9500]/10 p-4 text-xs text-[#9c4200] space-y-1">
          <p className="font-semibold">브라우저 알림 권한이 차단되어 있습니다</p>
          <p>
            브라우저 주소창 왼쪽의 사이트 설정 아이콘을 눌러 <strong>알림 권한을 &apos;허용&apos;</strong>으로 변경한 뒤 다시 시도해 주세요.
          </p>
        </div>
      )}

      {iosNeedsInstall && (
        <div className="rounded-xl border border-[#ff9500]/30 bg-[#ff9500]/10 p-4 text-xs text-[#9c4200] space-y-1">
          <p className="font-semibold">iOS Safari 알림 안내</p>
          <p>
            iPhone / iPad에서는 공유 버튼 → <strong>홈 화면에 추가</strong>로 앱을 설치한 뒤,
            설치된 앱에서 알림을 등록해야 Web Push를 받을 수 있습니다.
          </p>
        </div>
      )}

      {!supported && (
        <div className="rounded-xl bg-[#f5f5f7] px-4 py-3 text-xs text-[#6e6e73]">
          현재 브라우저 환경에서는 Web Push API를 사용할 수 없습니다. (HTTPS 또는 localhost 환경의 최신 브라우저가 필요합니다.)
        </div>
      )}

      {/* 계정 전역 알림 옵션 */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-[#1d1d1f]">계정 알림 정책</h4>

        <div className="flex items-center justify-between gap-4 rounded-xl border border-black/[0.06] bg-[#f5f5f7] p-4">
          <div>
            <p className="text-xs font-bold text-[#1d1d1f]">새 메일 푸시 알림 수신</p>
            <p className="mt-0.5 text-[11px] text-[#6e6e73]">
              비활성화하면 등록된 모든 기기로 새 메일 푸시를 발송하지 않습니다. (스팸함 메일은 항상 제외)
            </p>
          </div>
          <ToggleSwitch
            checked={pushEnabled}
            disabled={updatingField !== null}
            onChange={(next) => handleToggleSetting('pushEnabled', next)}
            color="primary"
            showStatusText={false}
            className="shrink-0"
          />
        </div>

        <div className="flex items-center justify-between gap-4 rounded-xl border border-black/[0.06] bg-[#f5f5f7] p-4">
          <div>
            <p className="text-xs font-bold text-[#1d1d1f]">발신자 및 제목 미리보기 표시</p>
            <p className="mt-0.5 text-[11px] text-[#6e6e73]">
              끄면 알림에 발신자와 제목 대신 &quot;새로운 메일이 도착했습니다.&quot;만 표시됩니다.
            </p>
          </div>
          <ToggleSwitch
            checked={pushPreviewEnabled}
            disabled={updatingField !== null}
            onChange={(next) => handleToggleSetting('pushPreviewEnabled', next)}
            color="primary"
            showStatusText={false}
            className="shrink-0"
          />
        </div>
      </div>

      {/* 등록된 기기 목록 */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-[#1d1d1f]">
          등록된 알림 기기 ({subscriptions.length})
        </h4>

        <div className="rounded-xl border border-black/[0.06] bg-[#f5f5f7]/60 px-4">
          {subscriptions.length === 0 ? (
            <p className="py-6 text-center text-xs text-[#86868b]">
              아직 등록된 기기가 없습니다.
            </p>
          ) : (
            <ul className="divide-y divide-black/[0.06]">
              {subscriptions.map((sub) => {
                const isCurrent = sub.endpoint === currentEndpoint;
                return (
                  <li key={sub.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Smartphone className="h-4 w-4 shrink-0 text-[#86868b]" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-xs font-semibold text-[#1d1d1f]">
                            {sub.deviceLabel || '웹 브라우저'}
                          </span>
                          {isCurrent && (
                            <span className="rounded-full bg-[#0071e3]/12 px-2 py-0.5 text-[10px] font-semibold text-[#0071e3]">
                              현재 기기
                            </span>
                          )}
                        </div>
                        <p className="truncate text-[11px] text-[#86868b]">
                          등록: {new Date(sub.createdAt).toLocaleString('ko-KR')}
                          {sub.lastUsedAt
                            ? ` · 최근 발송: ${new Date(sub.lastUsedAt).toLocaleString('ko-KR')}`
                            : ''}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveSubscription(sub)}
                      disabled={busy}
                      className="rounded-lg p-1.5 text-[#86868b] hover:bg-[#ff3b30]/10 hover:text-[#ff3b30] disabled:opacity-50 transition"
                      title="구독 삭제"
                      aria-label={`${sub.deviceLabel || '웹 브라우저'} 알림 구독 삭제`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};
