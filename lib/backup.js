// Backup & restore utilities for InventManage.
// - Backup: fetch all tables as raw DB rows → bundled JSON
// - Upload: Supabase Storage bucket "backups"
// - Restore: upsert in FK-safe order (merge-duplicates)
// - Auto-backup: 起動時＋変更の3分後（変更なしスキップ・1日1ファイル）

import { ensureValidSession } from './supabase.js';

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
  'invent_fiscal_snapshots',
];

// テーブル未作成でもバックアップを止めないテーブル（方法C: 後から追加されたため）
const OPTIONAL_BACKUP_TABLES = new Set(['invent_fiscal_snapshots']);

// 復元対象。invent_staff は保護方針（現行DBが常に正・一括操作で触らない）により
// バックアップには含めるが、復元では書き戻さない。
export const RESTORE_TABLES = BACKUP_TABLES.filter((t) => t !== 'invent_staff');

// 完全復元時の削除順（FKの都合で子→親）。invent_staff は対象外。
const REPLACE_DELETE_ORDER = [
  'invent_stock_movements',
  'invent_fiscal_snapshots',
  'invent_child_assets',
  'invent_parent_assets',
  'invent_suppliers',
  'invent_categories',
];

async function authHeaders(session) {
  await ensureValidSession(session);
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
      { headers: await authHeaders(session) }
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
    try {
      payload.tables[table] = await fetchAllRows(table, session);
    } catch (err) {
      if (OPTIONAL_BACKUP_TABLES.has(table)) {
        payload.tables[table] = []; // テーブル未作成でもバックアップ継続
      } else {
        throw err;
      }
    }
  }
  return payload;
}

function makeFileName(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `inventmanage/inventmanage_backup_${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}.json`;
}

// ファイル名から日付部分（YYYY-MM-DD）を取り出す
function getBackupItemDay(item) {
  const match = (item?.name || '').match(/backup_(\d{4}-\d{2}-\d{2})_/);
  return match ? match[1] : '';
}

function parseBackupTimestampFromName(name) {
  const m = String(name || '').match(/backup_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})\.json$/);
  if (!m) return 0;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])).getTime();
}

function getStorageItemTimestamp(item) {
  const storageTime = Date.parse(item?.updated_at || item?.created_at || '');
  return Number.isFinite(storageTime) ? storageTime : parseBackupTimestampFromName(item?.name);
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
      ...(await authHeaders(session)),
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
      ...(await authHeaders(session)),
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

export async function getLatestStorageBackupTime(session) {
  const items = await listStorageBackups(session);
  const latest = items.reduce((max, item) => Math.max(max, getStorageItemTimestamp(item)), 0);
  if (latest) setLastBackupTime(latest);
  return latest;
}

export async function downloadStorageBackup(session, fileName) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${fileName}`, {
    headers: await authHeaders(session),
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
    headers: await authHeaders(session),
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

// 変更なしスキップを許可する最大経過日数（これを超えたら変更がなくてもバックアップする）
const UNCHANGED_SKIP_MAX_AGE_DAYS = 7;

// Full backup flow: build → upload to Storage → local download → prune old.
export async function performBackup(session, { downloadLocal = true, prune = true, skipIfUnchanged = false } = {}) {
  if (_backupInFlight) return _backupInFlight;
  // 開始時点で lastBackupTime を記録（アップロード中にページリロード等で
  // 2 回目の自動バックアップが走るのを防ぐ）。失敗時は finally でロールバック。
  const prevLastBackup = getLastBackupTime();
  setLastBackupTime(Date.now());
  _backupInFlight = (async () => {
  const payload = await buildBackupPayload(session);

  // データに変更がない場合はスキップ（直近バックアップが7日以内のときのみ。
  // 7日を超えたら変更がなくても新規バックアップして鮮度を保つ）
  if (skipIfUnchanged) {
    try {
      const backups = await listStorageBackups(session);
      if (backups.length > 0) {
        const latest = backups[0]; // sortBy name desc → 先頭が最新
        const latestTime = getStorageItemTimestamp(latest);
        const isFresh = latestTime > 0 &&
          Date.now() - latestTime < UNCHANGED_SKIP_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
        if (isFresh) {
          const latestPayload = await downloadStorageBackup(session, latest.name);
          if (JSON.stringify(latestPayload?.tables) === JSON.stringify(payload.tables)) {
            setLastBackupTime(latestTime);
            return { skipped: true, fileName: latest.name, payload, pruneResult: null };
          }
        }
      }
    } catch {
      /* 比較に失敗した場合は通常どおりバックアップする */
    }
  }

  const fileName = makeFileName(); // 例: inventmanage/inventmanage_backup_2026-05-22_19-56-02.json
  const localFileName = fileName.split('/').pop(); // ローカルDL用: inventmanage_backup_...json
  await uploadToStorage(session, fileName, payload);

  // 同じ日の古いバックアップを削除して「1日1ファイル」に保つ
  try {
    const day = getBackupItemDay({ name: fileName });
    if (day) {
      const items = await listStorageBackups(session);
      for (const item of items) {
        if (item.name !== fileName && getBackupItemDay(item) === day) {
          await deleteStorageBackup(session, item.name);
        }
      }
    }
  } catch {
    /* 同日分の整理失敗は致命的でないため無視（pruneで回収される） */
  }
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
        ...(await authHeaders(session)),
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

async function fetchAllIds(table, session) {
  const ids = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?select=id&order=id.asc&limit=${PAGE_SIZE}&offset=${offset}`,
      { headers: await authHeaders(session) }
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${table} のID取得に失敗しました (${res.status}): ${text}`);
    }
    const page = await res.json();
    ids.push(...page.map((r) => r.id));
    if (page.length < PAGE_SIZE) return ids;
  }
}

async function deleteRowsByIds(table, ids, session) {
  const BATCH = 200;
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    const filter = batch.map((v) => encodeURIComponent(String(v))).join(',');
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=in.(${filter})`, {
      method: 'DELETE',
      headers: { ...(await authHeaders(session)), Prefer: 'return=minimal' },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${table} の削除に失敗しました (${res.status}): ${text}`);
    }
  }
}

// mode:
//   'merge'   … 従来どおりの上書き復元。バックアップ後に追加された行は残る
//   'replace' … 完全復元。まずバックアップの内容を書き戻し、その後
//               バックアップに存在しない行（後から追加された行）を削除して
//               バックアップ時点の状態に揃える
// いずれのモードでも invent_staff には一切書き込まない（保護方針）。
export async function restoreFromPayload(payload, session, { mode = 'merge' } = {}) {
  if (!payload || !payload.tables) {
    throw new Error('無効なバックアップファイルです。');
  }
  const results = {};

  // 1) 書き戻し（親→子の順）。先に旧値へ戻すことで、後段の削除時に
  //    「復元済みの行が削除対象を参照している」状態を避ける。
  for (const table of RESTORE_TABLES) {
    const rows = payload.tables[table] || [];
    try {
      await upsertRows(table, rows, session);
      results[table] = { upserted: rows.length, deleted: 0 };
    } catch (err) {
      if (OPTIONAL_BACKUP_TABLES.has(table)) {
        results[table] = { upserted: 0, deleted: 0 }; // テーブル未作成ならスキップ
      } else {
        throw err;
      }
    }
  }

  // 2) 完全復元: バックアップに無い行を削除（FKの都合で子→親の順）
  if (mode === 'replace') {
    for (const table of REPLACE_DELETE_ORDER) {
      const rows = payload.tables[table];
      // バックアップにキー自体が無いテーブルは判断できないため触らない
      if (!Array.isArray(rows)) continue;
      // 任意テーブルが空配列の場合、「当時テーブル未作成」の可能性があるため削除しない
      if (OPTIONAL_BACKUP_TABLES.has(table) && rows.length === 0) continue;
      const backupIds = new Set(rows.map((r) => String(r.id)));
      const currentIds = await fetchAllIds(table, session);
      const extras = currentIds.filter((id) => !backupIds.has(String(id)));
      if (extras.length > 0) {
        await deleteRowsByIds(table, extras, session);
      }
      if (results[table]) results[table].deleted = extras.length;
      else results[table] = { upserted: 0, deleted: extras.length };
    }
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

export async function shouldRunAutoBackup(session) {
  if (!isAutoBackupEnabled()) return false;
  const last = await getLatestStorageBackupTime(session);
  if (!last) return true;
  const hoursSince = (Date.now() - last) / 1000 / 60 / 60;
  return hoursSince >= AUTO_BACKUP_INTERVAL_HOURS;
}

