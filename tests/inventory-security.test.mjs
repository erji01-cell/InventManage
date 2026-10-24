// Optional PostgreSQL validation, using the same isolated PGlite runtime as audit tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

test('inventory access is authenticated-only while existing data and other apps are preserved', {
  skip: !process.env.INVENT_AUDIT_PGLITE_PATH,
}, async () => {
  const { PGlite } = await import(pathToFileURL(process.env.INVENT_AUDIT_PGLITE_PATH).href);
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create table public.invent_child_assets (id integer primary key, brand_name text);
      create table public.invent_stock_movements (id integer primary key, child_asset_id integer, quantity integer);
      create table public.other_app_data (id integer primary key);
      insert into public.invent_child_assets values (1, 'テスト資産');
      insert into public.invent_stock_movements values (1, 1, 10);
      insert into public.other_app_data values (1);
      alter table public.invent_child_assets enable row level security;
      alter table public.invent_stock_movements enable row level security;
      create policy assets_read on public.invent_child_assets for select to authenticated using (true);
      create policy movements_read on public.invent_stock_movements for select to authenticated using (true);
      create policy invent_child_assets_authenticated_update on public.invent_child_assets
        for update to anon, authenticated using (true) with check (true);
      create policy invent_stock_movements_authenticated_update on public.invent_stock_movements
        for update to anon, authenticated using (true) with check (true);
      create view public.v_invent_current_stocks as
        select c.id, c.brand_name, sum(m.quantity) as quantity from public.invent_child_assets c
        left join public.invent_stock_movements m on m.child_asset_id = c.id group by c.id;
      grant all on all tables in schema public to anon, authenticated;
      grant select on public.v_invent_current_stocks to public;
    `);

    await db.exec('set role anon;');
    assert.equal((await db.query('select quantity from public.v_invent_current_stocks')).rows[0].quantity, 10);
    await db.exec('reset role;');
    const before = (await db.query('select pg_get_viewdef(\'public.v_invent_current_stocks\'::regclass) as definition')).rows[0].definition;

    const sql = await readFile(new URL('../supabase/migrations/20261024082953_harden_inventory_access.sql', import.meta.url), 'utf8');
    await db.exec(sql);
    await db.exec(sql);
    const after = (await db.query('select pg_get_viewdef(\'public.v_invent_current_stocks\'::regclass) as definition')).rows[0].definition;
    assert.equal(after, before);
    assert.deepEqual((await db.query("select roles from pg_policies where policyname like 'invent_%_authenticated_update' order by tablename")).rows.map((row) => row.roles), [['authenticated'], ['authenticated']]);

    await db.exec('set role anon;');
    for (const statement of [
      'select * from public.v_invent_current_stocks',
      'select * from public.invent_child_assets',
      'select * from public.invent_stock_movements',
      'update public.invent_child_assets set brand_name = \'不正変更\' where id = 1',
      'delete from public.invent_stock_movements',
    ]) await assert.rejects(db.exec(statement), /permission denied/);
    assert.equal((await db.query('select count(*) as total from public.other_app_data')).rows[0].total, 1);

    await db.exec('reset role; set role authenticated;');
    assert.deepEqual((await db.query('select * from public.v_invent_current_stocks')).rows, [{ id: 1, brand_name: 'テスト資産', quantity: 10 }]);
    await db.exec("update public.invent_child_assets set brand_name = '変更後' where id = 1;");
    await db.exec('update public.invent_stock_movements set quantity = 12 where id = 1;');
    assert.equal((await db.query('select quantity from public.v_invent_current_stocks')).rows[0].quantity, 12);
    assert.equal((await db.query("select has_table_privilege(current_user, 'public.v_invent_current_stocks', 'UPDATE') as can_update")).rows[0].can_update, false);
    await assert.rejects(
      db.exec("update public.v_invent_current_stocks set brand_name = '変更不可' where id = 1"),
      (error) => error.code === '42501' || error.code === '55000',
    );
  } finally {
    await db.close();
  }
});
