// Push-Mitteilungen abonnieren. Auf dem iPhone nur in der installierten App (Home-Bildschirm, ab iOS 16.4).
import { api } from './api';

export type PushState = 'unsupported' | 'denied' | 'off' | 'on';

const supported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

async function registration() {
  return navigator.serviceWorker.getRegistration();
}

export async function pushState(): Promise<PushState> {
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await registration();
  if (!reg) return 'unsupported';
  return (await reg.pushManager.getSubscription()) ? 'on' : 'off';
}

const toKey = (b64: string) => {
  const s = atob(
    (b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'),
  );
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

export async function enablePush(): Promise<PushState> {
  if (!supported()) return 'unsupported';
  if ((await Notification.requestPermission()) !== 'granted') return 'denied';
  const reg = await registration();
  if (!reg) return 'unsupported';
  const { publicKey } = await api<{ publicKey: string }>('/api/push/key');
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: toKey(publicKey),
  });
  await api('/api/push/subscription', { method: 'POST', body: sub.toJSON() });
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  const sub = await (await registration())?.pushManager.getSubscription();
  if (sub) {
    await api('/api/push/subscription', { method: 'DELETE', body: { endpoint: sub.endpoint } });
    await sub.unsubscribe();
  }
  return 'off';
}
