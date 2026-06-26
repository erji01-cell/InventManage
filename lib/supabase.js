import { normalizeAsset, normalizeMovement, toNumber } from '../utils/inventory.js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;
const PAGE_SIZE = 1000;
const SESSION_STORAGE_KEY = 'invent_manage_supabase_session';
const SAVED_EMAIL_STORAGE_KEY = 'invent_manage_saved_email';

export function getStoredSession() {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;

    const session = JSON.parse(raw);
    if (session.expires_at && session.expires_at * 1000 <= Date.now()) {
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

  return {
    ...payload,
    expires_at: Math.floor(Date.now() / 1000) + payload.expires_in,
  };
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

  const accessToken = session?.access_token || SUPABASE_KEY;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

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
