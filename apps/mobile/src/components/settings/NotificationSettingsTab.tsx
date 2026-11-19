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
    return <p className="py-8 text-center text-xs text-slate-400">불러오는 중...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-[#007AFF]" />
          <span className="text-sm font-bold text-slate-900">Web Push 알림</span>
        </div>
        <span className={currentSubscription ? 'text-xs font-semibold text-emerald-600' : 'text-xs text-slate-400'}>
          {currentSubscription ? '구독 중' : '미등록'}
        </span>
      </div>

      {message && (
        <div
          className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-rose-50 text-rose-700'
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
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 space-y-1">
          <p className="font-semibold">iOS Safari 알림 안내</p>
          <p>
            iPhone / iPad에서는 공유 버튼 → <strong>홈 화면에 추가</strong>로 앱을 설치한 뒤,
            설치된 앱에서 알림을 등록해야 Web Push를 받을 수 있습니다.
          </p>
        </div>
      )}

      {!supported && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-600">
          현재 브라우저 환경에서는 Web Push API를 사용할 수 없습니다.
        </div>
      )}

      <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100 text-sky-600">
            {currentSubscription ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">현재 기기 Web Push</h3>
            <p className="text-xs text-slate-500">
              권한: <span className="font-semibold">{permission}</span>
              {' · '}
              <span className={currentSubscription ? 'font-semibold text-emerald-600' : 'text-slate-500'}>
                {currentSubscription ? '구독 중' : '미등록'}
              </span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {currentSubscription ? (
            <>
              <button
                type="button"
                onClick={handleTestPush}
                disabled={testing || busy}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 active:scale-95 disabled:opacity-50"
              >
                {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                <span>테스트 알림</span>
              </button>
              <button
                type="button"
                onClick={handleUnsubscribeThisDevice}
                disabled={busy}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 active:scale-95 disabled:opacity-50"
              >
                <BellOff className="h-3.5 w-3.5" />
                <span>알림 끄기</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleSubscribeThisDevice}
              disabled={busy || !supported}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#007AFF] px-4 py-2.5 text-xs font-semibold text-white active:scale-95 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />}
              <span>이 기기에서 알림 받기</span>
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3 pt-1">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">새 메일 푸시 알림</p>
            <p className="text-xs text-slate-500">스팸함 메일은 알림에서 제외됩니다.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={pushEnabled}
            aria-label="새 메일 푸시 알림"
            onClick={() => handleToggleSetting('pushEnabled', !pushEnabled)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              pushEnabled ? 'bg-[#007AFF]' : 'bg-slate-200'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                pushEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">발신자/제목 미리보기</p>
            <p className="text-xs text-slate-500">끄면 도착 여부만 간단히 표시합니다.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={pushPreviewEnabled}
            aria-label="발신자/제목 미리보기"
            onClick={() => handleToggleSetting('pushPreviewEnabled', !pushPreviewEnabled)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              pushPreviewEnabled ? 'bg-[#007AFF]' : 'bg-slate-200'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                pushPreviewEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      <div className="border-t border-slate-100 pt-3 space-y-2">
        <h3 className="text-xs font-bold text-slate-500">
          등록된 기기 ({subscriptions.length})
        </h3>
        {subscriptions.length === 0 ? (
          <p className="py-3 text-center text-xs text-slate-400">등록된 기기가 없습니다.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {subscriptions.map((sub) => (
              <li key={sub.id} className="flex items-center justify-between gap-2 py-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Smartphone className="h-4 w-4 shrink-0 text-slate-400" />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-800">
                      {sub.deviceLabel || '웹 브라우저'}
                      {sub.endpoint === currentEndpoint && (
                        <span className="ml-1.5 rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] text-sky-700">
                          현재
                        </span>
                      )}
                    </p>
                    <p className="truncate text-[11px] text-slate-400">
                      {new Date(sub.createdAt).toLocaleDateString('ko-KR')}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveSubscription(sub)}
                  disabled={busy}
                  className="rounded-lg p-1.5 text-slate-400 hover:text-rose-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
