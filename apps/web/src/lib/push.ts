import { pushApi } from './api';
import type { PushSubscriptionItem } from '@lemail/shared-types';

export function isPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

export function isIosSafariNotInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIos = /iPhone|iPad|iPod/i.test(ua);
  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true;
  return isIos && !isStandalone;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function arrayBufferToBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window
    .btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function getOrRegisterServiceWorker(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (!existing) {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  }
  return navigator.serviceWorker.ready;
}

export async function getCurrentBrowserPushEndpoint(): Promise<string | null> {
  if (!isPushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    if (!reg) return null;
    const sub = await reg.pushManager.getSubscription();
    return sub?.endpoint || null;
  } catch {
    return null;
  }
}

export async function subscribeCurrentBrowserPush(
  deviceLabel?: string,
): Promise<PushSubscriptionItem> {
  if (!isPushSupported()) {
    throw new Error('이 브라우저는 Web Push 알림을 지원하지 않습니다.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('브라우저 알림 권한이 거부되었습니다. 브라우저 설정에서 알림을 허용해 주세요.');
  }

  const { publicKey } = await pushApi.getVapidPublicKey();
  if (!publicKey) {
    throw new Error('서버의 VAPID 공개키가 설정되지 않았습니다.');
  }

  const registration = await getOrRegisterServiceWorker();
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh || arrayBufferToBase64Url(subscription.getKey('p256dh'));
  const auth = json.keys?.auth || arrayBufferToBase64Url(subscription.getKey('auth'));

  if (!p256dh || !auth) {
    throw new Error('브라우저 푸시 암호화 키를 생성하지 못했습니다.');
  }

  return pushApi.registerSubscription({
    endpoint: subscription.endpoint,
    keys: { p256dh, auth },
    deviceLabel,
  });
}

export async function unsubscribeCurrentBrowserPush(): Promise<void> {
  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration('/');
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await sub.unsubscribe().catch(() => {});
  }
}
