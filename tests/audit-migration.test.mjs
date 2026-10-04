// Run with INVENT_AUDIT_PGLITE_PATH pointing to a separately installed PGlite module.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.INVENT_AUDIT_PGLITE_PATH;

test('audit triggers, transaction consistency, permissions and repeatable installation', { skip: !modulePath }, async () => {
  const { PGlite } = await import(pathToFileURL(modulePath).href);
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      create function auth.jwt() returns jsonb language sql stable as
        $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
      create function auth.uid() returns uuid language sql stable as
        $$ select (auth.jwt() ->> 'sub')::uuid $$;
      grant usage on schema auth to public;
      create table public.invent_child_assets (id integer primary key, brand_name text, delivery_price numeric, child_memo text);
      create table public.invent_parent_assets (id text primary key, generic_name text);
      create table public.invent_categories (id integer primary key, name text);
      create table public.invent_stock_movements (id integer primary key, child_asset_id integer, quantity integer);
      create table public.invent_suppliers (id integer primary key, name text);
      create table public.invent_staff (id integer primary key, name text);
      grant select, insert, update, delete on all tables in schema public to authenticated;
      insert into public.invent_child_assets values (1, '導入前データ', 100, null);
    `);
    const sql = await readFile(new URL('../outputs/supabase_migration/create_audit_logs.sql', import.meta.url), 'utf8');
    await db.exec(sql);
    assert.equal((await db.query('select * from public.invent_audit_logs')).rows.length, 0);

    await db.exec(`
      set request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","email":"operator@example.test","role":"authenticated"}';
      set role authenticated;
      insert into public.invent_child_assets values (2, 'テスト資産', 50, '元の摘要');
      update public.invent_child_assets set delivery_price = 0, child_memo = null where id = 2;
      update public.invent_child_assets set delivery_price = 0 where id = 2;
      delete from public.invent_child_assets where id = 2;
    `);
    let logs = (await db.query('select * from public.invent_audit_logs order by id')).rows;
    assert.deepEqual(logs.map((log) => log.operation), ['INSERT', 'UPDATE', 'DELETE']);
    assert.equal(logs[0].actor_email, 'operator@example.test');
    assert.equal(logs[0].actor_user_id, '11111111-1111-4111-8111-111111111111');
    assert.equal(logs[0].old_data, null);
    assert.equal(logs[1].old_data.delivery_price, 50);
    assert.equal(logs[1].new_data.delivery_price, 0);
    assert.equal(logs[1].new_data.child_memo, null);
    assert.deepEqual(logs[1].changed_fields, ['child_memo', 'delivery_price']);
    assert.equal(logs[2].old_data.brand_name, 'テスト資産');
    assert.equal(logs[2].new_data, null);

    await db.exec('begin; insert into public.invent_child_assets values (3, \'ロールバック\', 1, null); rollback;');
    assert.equal((await db.query('select * from public.invent_audit_logs')).rows.length, 3);
    assert.equal((await db.query('select * from public.invent_child_assets where id = 3')).rows.length, 0);

    for (const statement of [
      "insert into public.invent_audit_logs (table_name, operation, actor_role) values ('invent_child_assets', 'INSERT', 'authenticated')",
      "update public.invent_audit_logs set actor_email = 'fake@example.test'",
      'delete from public.invent_audit_logs',
      'truncate public.invent_audit_logs',
    ]) await assert.rejects(db.exec(statement), /permission denied/);

    await db.exec('reset role; set role anon;');
    await assert.rejects(db.query('select * from public.invent_audit_logs'), /permission denied/);
    await db.exec('reset role; set role authenticated; reset request.jwt.claims;');
    assert.equal((await db.query('select * from public.invent_audit_logs')).rows.length, 0);

    await db.exec('reset role;');
    // A log-write failure must also roll back the business-data write.
    await db.exec("alter table public.invent_audit_logs add constraint test_reject_log check (record_id <> '99');");
    await db.exec("set role authenticated; set request.jwt.claims = '{\"sub\":\"11111111-1111-4111-8111-111111111111\",\"role\":\"authenticated\"}';");
    await assert.rejects(db.exec("insert into public.invent_child_assets values (99, '保存失敗', 1, null);"), /test_reject_log/);
    assert.equal((await db.query('select * from public.invent_child_assets where id = 99')).rows.length, 0);
    await db.exec('reset role; reset request.jwt.claims; alter table public.invent_audit_logs drop constraint test_reject_log;');
    await db.exec(sql);
    assert.equal((await db.query('select * from public.invent_audit_logs')).rows.length, 3);
    await db.exec("delete from public.invent_child_assets where id = 1;");
    logs = (await db.query('select * from public.invent_audit_logs order by id')).rows;
    assert.equal(logs.length, 4);
    assert.equal(logs[3].actor_user_id, null);
    assert.equal(logs[3].old_data.brand_name, '導入前データ');

    // Re-running the migration also attaches triggers to newly created optional tables.
    await db.exec('create table public.invent_inventory_counts (id integer primary key, status text);');
    await db.exec(sql);
    await db.exec("insert into public.invent_inventory_counts values (1, 'in_progress');");
    assert.equal((await db.query("select * from public.invent_audit_logs where table_name = 'invent_inventory_counts'")).rows.length, 1);
  } finally {
    await db.close();
  }
});
