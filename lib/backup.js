// Backup & restore utilities for InventManage.
// - Backup: fetch all tables as raw DB rows → bundled JSON
// - Upload: Supabase Storage bucket "backups"
// - Restore: upsert in FK-safe order (merge-duplicates)

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

const BUCKET = 'backups';
const PAGE_SIZE = 1000;
const KEEP_COUNT = 30;
const AUTO_BACKUP_INTERVAL_HOURS = 24;
const LAST_BACKUP_KEY = 'invent_manage_last_backup_at';
const AUTO_BACKUP_ENABLED_KEY = 'invent_manage_auto_backup_enabled';

// Order matters for restore (FK dependencies):
//   categories, suppliers, staff → parent_assets → child_assets → stock_movements
export const BACKUP_TABLES = [
  'invent_categories',
  'invent_suppliers',
  'invent_staff',
  'invent_parent_assets',
  'invent_child_assets',
  'invent_stock_movements',
];

function authHeaders(session) {
  const token = session?.access_token || SUPABASE_KEY;
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${token}`,
  };
}

async function fetchAllRows(table, session) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?select=*&order=id.asc&limit=${PAGE_SIZE}&offset=${offset}`,
      { headers: authHeaders(session) }
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${table} の取得に失敗しました (${res.status}): ${text}`);
    }
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

export async function buildBackupPayload(session) {
  const payload = {
    exportedAt: new Date().toISOString(),
    version: 1,
    tables: {},
  };
  for (const table of BACKUP_TABLES) {
    payload.tables[table] = await fetchAllRows(table, session);
  }
  return payload;
}

function makeFileName(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `inventmanage/inventmanage_backup_${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}.json`;
}

export function downloadJsonLocally(payload, fileName) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function uploadToStorage(session, fileName, payload) {
  const body = JSON.stringify(payload);
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${fileName}`, {
    method: 'POST',
    headers: {
      ...authHeaders(session),
      'Content-Type': 'application/json',
      'x-upsert': 'true',
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 404 || /bucket/i.test(text)) {
      throw new Error(
        `Storage バケット "${BUCKET}" が見つかりません。Supabase ダッシュボードで作成してください。\n詳細: ${text}`
      );
    }
    throw new Error(`Storage アップロードに失敗しました (${res.status}): ${text}`);
  }
}

export async function listStorageBackups(session) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
    method: 'POST',
    headers: {
      ...authHeaders(session),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prefix: 'inventmanage/',
      limit: 200,
      sortBy: { column: 'name', order: 'desc' },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 404) return [];
    throw new Error(`一覧取得に失敗しました (${res.status}): ${text}`);
  }
  const items = await res.json();
  return (items || []).filter((it) => it.name && it.name.endsWith('.json')).map((it) => ({
    ...it,
    name: `inventmanage/${it.name}`,
  }));
}

export async function downloadStorageBackup(session, fileName) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${fileName}`, {
    headers: authHeaders(session),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ダウンロードに失敗しました (${res.status}): ${text}`);
  }
  return res.json();
}

async function deleteStorageBackup(session, fileName) {
  await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${fileName}`, {
    method: 'DELETE',
    headers: authHeaders(session),
  });
}

export async function pruneOldBackups(session, keep = KEEP_COUNT) {
  const items = await listStorageBackups(session);
  // sortBy desc → newest first; keep the first `keep`, delete the rest.
  const toDelete = items.slice(keep);
  let deleted = 0;
  for (const item of toDelete) {
    try {
      await deleteStorageBackup(session, item.name);
      deleted++;
    } catch {
      /* swallow individual failures */
    }
  }
  return { deleted, kept: Math.min(items.length, keep) };
}

// Guard against concurrent backup runs (e.g. React StrictMode double-effect in dev).
let _backupInFlight = null;

// Full backup flow: build → upload to Storage → local download → prune old.
export async function performBackup(session, { downloadLocal = true, prune = true } = {}) {
  if (_backupInFlight) return _backupInFlight;
  // 開始時点で lastBackupTime を記録（アップロード中にページリロード等で
  // 2 回目の自動バックアップが走るのを防ぐ）。失敗時は finally でロールバック。
  const prevLastBackup = getLastBackupTime();
  setLastBackupTime(Date.now());
  _backupInFlight = (async () => {
  const payload = await buildBackupPayload(session);
  const fileName = makeFileName(); // 例: inventmanage/inventmanage_backup_2026-05-22_19-56-02.json
  const localFileName = fileName.split('/').pop(); // ローカルDL用: inventmanage_backup_...json
  await uploadToStorage(session, fileName, payload);
  if (downloadLocal) {
    downloadJsonLocally(payload, localFileName);
  }
  let pruneResult = null;
  if (prune) {
    pruneResult = await pruneOldBackups(session, KEEP_COUNT);
  }
  return { fileName, payload, pruneResult };
  })()
    .catch((err) => {
      // 失敗したら lastBackupTime をロールバックして次回再試行を許可
      setLastBackupTime(prevLastBackup);
      throw err;
    })
    .finally(() => { _backupInFlight = null; });
  return _backupInFlight;
}

async function upsertRows(table, rows, session) {
  if (!rows || rows.length === 0) return;
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=id`, {
      method: 'POST',
      headers: {
        ...authHeaders(session),
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${table} の復元に失敗しました (${res.status}): ${text}`);
    }
  }
}

export async function restoreFromPayload(payload, session) {
  if (!payload || !payload.tables) {
    throw new Error('無効なバックアップファイルです。');
  }
  const results = {};
  for (const table of BACKUP_TABLES) {
    const rows = payload.tables[table] || [];
    await upsertRows(table, rows, session);
    results[table] = rows.length;
  }
  return results;
}

// ---- local state helpers ----

export function getLastBackupTime() {
  const v = localStorage.getItem(LAST_BACKUP_KEY);
  return v ? Number(v) : 0;
}

export function setLastBackupTime(ts) {
  localStorage.setItem(LAST_BACKUP_KEY, String(ts));
}

export function isAutoBackupEnabled() {
  const v = localStorage.getItem(AUTO_BACKUP_ENABLED_KEY);
  return v === null ? true : v === 'true';
}

export function setAutoBackupEnabled(enabled) {
  localStorage.setItem(AUTO_BACKUP_ENABLED_KEY, String(enabled));
}

export function shouldRunAutoBackup() {
  if (!isAutoBackupEnabled()) return false;
  const last = getLastBackupTime();
  if (!last) return true;
  const hoursSince = (Date.now() - last) / 1000 / 60 / 60;
  return hoursSince >= AUTO_BACKUP_INTERVAL_HOURS;
}

