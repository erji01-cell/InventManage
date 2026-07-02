import { normalizeAsset, normalizeMovement, toNumber } from '../utils/inventory.js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;
const PAGE_SIZE = 1000;
const SESSION_STORAGE_KEY = 'invent_manage_supabase_session';
const SAVED_EMAIL_STORAGE_KEY = 'invent_manage_saved_email';
const TOKEN_REFRESH_MARGIN_SECONDS = 60;

let refreshSessionPromise = null;

export function getStoredSession() {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;

    const session = JSON.parse(raw);
    if (session.expires_at && session.expires_at * 1000 <= Date.now() && !session.refresh_token) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }

    return session;
  } catch {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

export function storeSession(session) {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredSession() {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

function withExpiresAt(payload) {
  return {
    ...payload,
    expires_at: Math.floor(Date.now() / 1000) + Number(payload.expires_in || 3600),
  };
}

export function getSavedEmail() {
  return localStorage.getItem(SAVED_EMAIL_STORAGE_KEY) || '';
}

export function storeSavedEmail(email) {
  localStorage.setItem(SAVED_EMAIL_STORAGE_KEY, email);
}

export function clearSavedEmail() {
  localStorage.removeItem(SAVED_EMAIL_STORAGE_KEY);
}

export async function signInWithPassword(email, password) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('SupabaseのURLまたは公開キーが設定されていません。.envを確認してください。');
  }

  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.msg || payload?.message || 'ログインできませんでした。');
  }

  return withExpiresAt(payload);
}

function isSessionExpiring(session) {
  if (!session?.access_token || !session.expires_at) return false;
  return session.expires_at - Math.floor(Date.now() / 1000) <= TOKEN_REFRESH_MARGIN_SECONDS;
}

function authExpiredError() {
  const err = new Error('ログインの有効期限が切れました。もう一度ログインしてください。');
  err.code = 'AUTH_EXPIRED';
  return err;
}

async function performSessionRefresh(session) {
  // 別タブが先にリフレッシュ済みの場合、旧トークンで更新すると
  // 「Refresh Token Not Found」になるため、localStorage の最新セッションを先に取り込む
  const stored = getStoredSession();
  if (
    stored?.access_token &&
    stored.access_token !== session.access_token &&
    stored.expires_at &&
    !isSessionExpiring(stored)
  ) {
    Object.assign(session, stored);
    return session;
  }

  const refreshToken = stored?.refresh_token || session?.refresh_token;
  if (!refreshToken) {
    clearStoredSession();
    throw authExpiredError();
  }

  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    // 生の英語メッセージ（Invalid Refresh Token 等）は表示せず、
    // 再ログインを促す扱いに統一する
    clearStoredSession();
    throw authExpiredError();
  }

  const refreshed = withExpiresAt(payload);
  Object.assign(session, refreshed);
  storeSession(session);
  return session;
}

// リフレッシュは必ずこの関数経由で1本化する。
// 並列リクエストが同時に走ってもトークン更新は1回だけになり、
// ローテーション済みトークンの再利用（Refresh Token Not Found）を防ぐ。
export function refreshSession(session) {
  if (!refreshSessionPromise) {
    refreshSessionPromise = performSessionRefresh(session).finally(() => {
      refreshSessionPromise = null;
    });
  }
  return refreshSessionPromise;
}

export async function ensureValidSession(session) {
  if (!session?.access_token || !isSessionExpiring(session)) return session;
  return refreshSession(session);
}

export async function signOut(session) {
  if (!session?.access_token) return;

  await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${session.access_token}`,
    },
  });
}

export async function supabaseRequest(path, options = {}, session = null) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('SupabaseのURLまたは公開キーが設定されていません。.envを確認してください。');
  }

  await ensureValidSession(session);

  const sendRequest = () => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${session?.access_token || SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  let response = await sendRequest();
  let text = await response.text();
  let payload = text ? JSON.parse(text) : null;

  if (!response.ok && session?.refresh_token && /JWT expired/i.test(payload?.message || text)) {
    await refreshSession(session);
    response = await sendRequest();
    text = await response.text();
    payload = text ? JSON.parse(text) : null;
  }

  if (!response.ok) {
    throw new Error(payload?.message || 'Supabaseへの接続でエラーが発生しました。');
  }

  return payload;
}

async function fetchTable(tableName, orderBy = 'id.asc', session = null) {
  const rows = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await supabaseRequest(
      `${tableName}?select=*&order=${orderBy}&limit=${PAGE_SIZE}&offset=${offset}`,
      {},
      session
    );
    rows.push(...page);

    if (page.length < PAGE_SIZE) {
      return rows;
    }
  }
}

export async function loadInventoryData(session) {
  const [suppliers, staff, parents, childAssets, movements, categories] = await Promise.all([
    fetchTable('invent_suppliers', 'id.asc', session),
    fetchTable('invent_staff', 'id.asc', session),
    fetchTable('invent_parent_assets', 'id.asc', session),
    fetchTable('invent_child_assets', 'id.asc', session),
    fetchTable('invent_stock_movements', 'movement_date.desc', session),
    fetchTable('invent_categories', 'display_order.asc', session),
  ]);

  // 年度スナップショットはテーブル未作成でも動くよう、失敗時は空配列にフォールバック
  let fiscalSnapshots = [];
  try {
    fiscalSnapshots = await fetchTable('invent_fiscal_snapshots', 'id.asc', session);
  } catch {
    fiscalSnapshots = [];
  }

  const supplierMap = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
  const staffMap = new Map(staff.map((member) => [member.id, member]));
  const parentMap = new Map(parents.map((parent) => [parent.id, parent]));
  const categoryMap = new Map(categories.map((cat) => [cat.id, cat]));

  return {
    suppliers,
    categories: categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      displayOrder: cat.display_order,
    })),
    staff: staff.map((member) => ({
      id: String(member.id),
      name: member.name,
      isActive: member.is_active !== false,
    })),
    assets: childAssets
      .filter((asset) => asset.is_active !== false)
      .map((asset) => normalizeAsset(asset, parentMap, supplierMap, categoryMap)),
    movements: movements.map((movement) => normalizeMovement(movement, staffMap)),
    fiscalSnapshots: fiscalSnapshots.map((s) => ({
      id: s.id,
      assetId: String(s.child_asset_id),
      fiscalYear: Number(s.fiscal_year),
      openingStock: toNumber(s.opening_stock),
      closingStock: toNumber(s.closing_stock),
      closedAt: s.closed_at || null,
    })),
  };
}
