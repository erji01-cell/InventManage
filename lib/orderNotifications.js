import { RealtimeClient } from '@supabase/realtime-js';

import { ensureValidSession } from './supabase.js';

export { normalizeOrderRequest } from '../utils/orders.js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;
const LAST_SEEN_PREFIX = 'invent_manage_order_last_seen';

function lastSeenKey(session) {
  return `${LAST_SEEN_PREFIX}:${session?.user?.id || session?.user?.email || 'default'}`;
}

export function getLastSeenOrderAt(session) {
  return localStorage.getItem(lastSeenKey(session)) || '';
}

export function markOrdersSeen(session, orders) {
  const latest = orders.reduce((value, order) => (
    order.requestedAt > value ? order.requestedAt : value
  ), '');
  localStorage.setItem(lastSeenKey(session), latest || new Date().toISOString());
}

export function getUnseenOrders(session, orders) {
  const lastSeen = getLastSeenOrderAt(session);
  return orders.filter((order) => order.status === 'requested' && (!lastSeen || order.requestedAt > lastSeen));
}

export function getDesktopNotificationPermission() {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

export async function requestDesktopNotificationPermission() {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.requestPermission();
}

export function showDesktopOrderNotification(order, prefix = '新しい発注依頼') {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const unit = order.purchaseUnit ? ` ${order.purchaseUnit}` : '';
  new Notification(prefix, {
    body: `${order.supplierName}\n${order.assetName} ${order.quantity.toLocaleString()}${unit}`,
    tag: `invent-order-${order.id}`,
  });
}

export function subscribeToOrderRequests(session, onChange, onStatus) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !session?.access_token) return () => {};

  const realtime = new RealtimeClient(`${SUPABASE_URL}/realtime/v1`, {
    params: { apikey: SUPABASE_KEY },
  });
  let channel = null;
  let disposed = false;

  const refreshRealtimeToken = async () => {
    try {
      await ensureValidSession(session);
      await realtime.setAuth(session.access_token);
    } catch (error) {
      onStatus?.('TOKEN_ERROR', error);
    }
  };

  (async () => {
    await refreshRealtimeToken();
    if (disposed) return;
    channel = realtime
      .channel('invent-order-requests')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'invent_order_requests' },
        (payload) => onChange?.(payload)
      )
      .subscribe((status, error) => onStatus?.(status, error));
  })();

  const tokenTimer = window.setInterval(refreshRealtimeToken, 45 * 1000);
  return () => {
    disposed = true;
    window.clearInterval(tokenTimer);
    if (channel) realtime.removeChannel(channel);
  };
}

export async function sendOrderNotificationEmail(session, order) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Supabaseの接続設定がありません。');
  }
  await ensureValidSession(session);
  const response = await fetch(`${SUPABASE_URL}/functions/v1/send-order-notification`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ order }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || `メール通知に失敗しました (${response.status})。`);
  }
  return payload;
}
