import { ensureValidSession } from './supabase.js';

export { normalizeOrderRequest } from '../utils/orders.js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;
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
