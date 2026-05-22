#!/usr/bin/env node
// Restore InventManage data from CSV backup files.
// Usage:
//   node scripts/restore_from_csv.mjs               # All tables
//   node scripts/restore_from_csv.mjs suppliers     # Only invent_suppliers (test)
//
// Safety:
//   - INSERT only with on_conflict=id (merge-duplicates). No DELETE/TRUNCATE/DROP.
//   - Reads .env from project root.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CSV_DIR = join(ROOT, 'outputs', 'supabase_migration');
const BATCH_SIZE = 500;

const TABLES = [
  { name: 'invent_suppliers',       file: 'invent_suppliers.csv' },
  { name: 'invent_staff',           file: 'invent_staff.csv' },
  { name: 'invent_parent_assets',   file: 'invent_parent_assets.csv' },
  { name: 'invent_child_assets',    file: 'invent_child_assets.csv' },
  { name: 'invent_stock_movements', file: 'invent_stock_movements.csv' },
];

const INTEGER_COLS = {
  invent_suppliers:       new Set(['id']),
  invent_staff:           new Set(['id']),
  invent_parent_assets:   new Set(['safety_stock']),
  invent_child_assets:    new Set(['id', 'opening_stock', 'supplier_id']),
  invent_stock_movements: new Set(['id', 'child_asset_id', 'quantity', 'staff_code']),
};
const NUMERIC_COLS = {
  invent_child_assets:    new Set(['delivery_price']),
  invent_stock_movements: new Set(['actual_delivery_price']),
};
const BOOLEAN_COLS = {
  invent_staff:        new Set(['is_active']),
  invent_child_assets: new Set(['is_active']),
};

function loadEnv() {
  const text = readFileSync(join(ROOT, '.env'), 'utf-8');
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

// RFC 4180-ish CSV parser supporting quoted fields with commas and newlines.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else { inQuotes = false; }
      } else {
        cell += c;
      }
    } else {
      if (c === '"') { inQuotes = true; }
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\r') { /* skip */ }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else { cell += c; }
    }
  }
  // last cell
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  // strip BOM from very first cell
  if (rows[0]?.[0]?.charCodeAt(0) === 0xFEFF) {
    rows[0][0] = rows[0][0].slice(1);
  }
  return rows;
}

function readCsvAsObjects(path, table) {
  const text = readFileSync(path, 'utf-8');
  const rows = parseCsv(text).filter(r => r.some(c => c !== ''));
  if (rows.length === 0) return [];
  const headers = rows[0];
  const intCols = INTEGER_COLS[table] || new Set();
  const numCols = NUMERIC_COLS[table] || new Set();
  const boolCols = BOOLEAN_COLS[table] || new Set();

  return rows.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, idx) => {
      let v = (r[idx] ?? '').trim();
      if (v === '') { obj[h] = null; }
      else if (intCols.has(h)) { obj[h] = parseInt(v, 10); }
      else if (numCols.has(h)) { obj[h] = parseFloat(v); }
      else if (boolCols.has(h)) { obj[h] = v.toLowerCase() === 'true'; }
      else { obj[h] = v; }
    });
    return obj;
  });
}

async function postBatch(supabaseUrl, serviceKey, table, batch) {
  const url = `${supabaseUrl}/rest/v1/${table}?on_conflict=id`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(batch),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${table} failed (${res.status}): ${text}`);
  }
}

async function importTable(supabaseUrl, serviceKey, table, file) {
  const path = join(CSV_DIR, file);
  const rows = readCsvAsObjects(path, table);
  console.log(`[${table}] ${rows.length} rows to import`);
  let done = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await postBatch(supabaseUrl, serviceKey, table, batch);
    done += batch.length;
    console.log(`  ... ${done}/${rows.length}`);
  }
  console.log(`[${table}] done (${done} rows)`);
}

async function main() {
  const env = loadEnv();
  const supabaseUrl = (env.SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl) throw new Error('SUPABASE_URL not set in .env');
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set in .env');

  const arg = (process.argv[2] || '').toLowerCase();
  let targets = TABLES;
  if (arg) {
    const matched = TABLES.find(t => t.name === arg || t.name === `invent_${arg}`);
    if (!matched) {
      console.error(`Unknown table: ${arg}`);
      console.error(`Available: ${TABLES.map(t => t.name).join(', ')}`);
      process.exit(1);
    }
    targets = [matched];
  }

  console.log(`Target: ${targets.map(t => t.name).join(', ')}`);
  console.log(`Supabase URL: ${supabaseUrl}`);
  console.log('');

  for (const t of targets) {
    await importTable(supabaseUrl, serviceKey, t.name, t.file);
  }
  console.log('\nAll done.');
}

main().catch(err => {
  console.error('\nERROR:', err.message);
  process.exit(1);
});
