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
    setMessage(null);
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
      <div className="flex items-center justify-center py-12 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2 text-sky-600" />
        <span className="text-sm">알림 설정을 불러오는 중...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {message && (
        <div
          className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
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

      {iosNeedsInstall && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 space-y-1">
          <p className="font-semibold">iOS Safari 알림 안내</p>
          <p>
            iPhone / iPad에서는 공유 버튼 → <strong>홈 화면에 추가</strong>로 앱을 설치한 뒤,
            설치된 앱에서 알림을 등록해야 Web Push를 받을 수 있습니다.
          </p>
        </div>
      )}

      {!supported && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
          현재 브라우저 환경에서는 Web Push API를 사용할 수 없습니다. (HTTPS 또는 localhost 환경의 최신 브라우저가 필요합니다.)
        </div>
      )}

      {/* 현재 기기 구독 카드 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
              {currentSubscription ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">현재 기기 Web Push 알림</h3>
              <p className="text-xs text-slate-500">
                브라우저 권한: <span className="font-semibold">{permission}</span>
                {' · '}
                상태:{' '}
                <span className={currentSubscription ? 'font-semibold text-emerald-600' : 'text-slate-500'}>
                  {currentSubscription ? '구독 중' : '미등록'}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {currentSubscription ? (
              <>
                <button
                  type="button"
                  onClick={handleTestPush}
                  disabled={testing || busy}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  <span>테스트 알림</span>
                </button>
                <button
                  type="button"
                  onClick={handleUnsubscribeThisDevice}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
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
                className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />}
                <span>이 기기에서 알림 받기</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 계정 전역 알림 옵션 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
        <h3 className="text-sm font-bold text-slate-900">계정 알림 정책</h3>

        <label className="flex items-center justify-between gap-4 cursor-pointer">
          <div>
            <p className="text-sm font-semibold text-slate-800">새 메일 푸시 알림 수신</p>
            <p className="text-xs text-slate-500">
              비활성화하면 등록된 모든 기기로 새 메일 푸시를 발송하지 않습니다. (스팸함 메일은 항상 제외)
            </p>
          </div>
          <input
            type="checkbox"
            checked={pushEnabled}
            onChange={(e) => handleToggleSetting('pushEnabled', e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
          />
        </label>

        <div className="border-t border-slate-100 pt-4">
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <div>
              <p className="text-sm font-semibold text-slate-800">발신자 및 제목 미리보기 표시</p>
              <p className="text-xs text-slate-500">
                끄면 알림에 발신자와 제목 대신 &quot;새로운 메일이 도착했습니다.&quot;만 표시됩니다.
              </p>
            </div>
            <input
              type="checkbox"
              checked={pushPreviewEnabled}
              onChange={(e) => handleToggleSetting('pushPreviewEnabled', e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
            />
          </label>
        </div>
      </div>

      {/* 등록된 기기 목록 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">
            등록된 알림 기기 ({subscriptions.length})
          </h3>
        </div>

        {subscriptions.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-400">
            아직 등록된 기기가 없습니다.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {subscriptions.map((sub) => {
              const isCurrent = sub.endpoint === currentEndpoint;
              return (
                <li key={sub.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Smartphone className="h-4 w-4 shrink-0 text-slate-400" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-slate-800">
                          {sub.deviceLabel || '웹 브라우저'}
                        </span>
                        {isCurrent && (
                          <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                            현재 기기
                          </span>
                        )}
                      </div>
                      <p className="truncate text-[11px] text-slate-400">
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
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                    title="구독 삭제"
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
  );
};
