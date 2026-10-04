-- Supabase SQL Editor で全体を実行する。実行後のデータ変更から記録する。
-- 再実行しても既存のログは保持される。
begin;

create table if not exists public.invent_audit_logs (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default clock_timestamp(),
  table_name text not null,
  record_id text,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  actor_user_id uuid,
  actor_email text,
  actor_role text not null,
  old_data jsonb,
  new_data jsonb,
  changed_fields text[] not null default '{}',
  transaction_id bigint not null default txid_current()
);

create index if not exists invent_audit_logs_occurred_at_idx
  on public.invent_audit_logs (occurred_at desc, id desc);
create index if not exists invent_audit_logs_table_time_idx
  on public.invent_audit_logs (table_name, occurred_at desc, id desc);
create index if not exists invent_audit_logs_record_time_idx
  on public.invent_audit_logs (record_id, occurred_at desc, id desc);

alter table public.invent_audit_logs enable row level security;

-- アプリからは閲覧のみ。ログを追加するのはDBトリガーだけ。
revoke all on table public.invent_audit_logs from public, anon, authenticated, service_role;
revoke all on sequence public.invent_audit_logs_id_seq from public, anon, authenticated, service_role;
grant select on table public.invent_audit_logs to authenticated, service_role;

drop policy if exists invent_audit_logs_authenticated_select on public.invent_audit_logs;
create policy invent_audit_logs_authenticated_select
  on public.invent_audit_logs for select to authenticated
  using ((select auth.uid()) is not null);

create or replace function public.invent_capture_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_fields text[];
begin
  if tg_op <> 'INSERT' then
    v_old := to_jsonb(old);
  end if;
  if tg_op <> 'DELETE' then
    v_new := to_jsonb(new);
  end if;

  -- 同じ値を保存しただけの場合は、変更履歴を増やさない。
  if tg_op = 'UPDATE' and v_old = v_new then
    return null;
  end if;

  select coalesce(array_agg(field_name order by field_name), '{}'::text[])
    into v_fields
  from jsonb_object_keys(coalesce(v_old, '{}'::jsonb) || coalesce(v_new, '{}'::jsonb)) as fields(field_name)
  where tg_op <> 'UPDATE' or (v_old -> field_name) is distinct from (v_new -> field_name);

  insert into public.invent_audit_logs (
    table_name, record_id, operation, actor_user_id, actor_email,
    actor_role, old_data, new_data, changed_fields
  ) values (
    tg_table_name,
    coalesce(v_new ->> 'id', v_old ->> 'id'),
    tg_op,
    auth.uid(),
    nullif(auth.jwt() ->> 'email', ''),
    coalesce(nullif(auth.jwt() ->> 'role', ''), session_user::text),
    v_old, v_new, v_fields
  );

  return null;
end;
$$;

revoke all on function public.invent_capture_audit_log() from public, anon, authenticated, service_role;

-- 行の削除や復元によって、監査ログ自体が連動して消えないよう外部キーは持たない。
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'invent_child_assets',
    'invent_parent_assets',
    'invent_categories',
    'invent_stock_movements',
    'invent_suppliers',
    'invent_staff',
    'invent_order_requests',
    'invent_inventory_counts',
    'invent_inventory_count_items',
    'invent_fiscal_snapshots'
  ] loop
    if to_regclass(format('public.%I', v_table)) is not null then
      execute format('drop trigger if exists invent_audit_changes on public.%I', v_table);
      execute format(
        'create trigger invent_audit_changes after insert or update or delete on public.%I '
        'for each row execute function public.invent_capture_audit_log()',
        v_table
      );
    else
      raise notice '% は未作成のためスキップしました。作成後にこのSQLを再実行してください。', v_table;
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
commit;
