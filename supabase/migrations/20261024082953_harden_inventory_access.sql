-- Inventory is shared by signed-in clinic staff, never by unauthenticated clients.
-- This changes privileges only; inventory values and view calculations stay intact.
begin;

alter view public.v_invent_current_stocks set (security_invoker = true);
revoke all on table public.v_invent_current_stocks from public, anon, authenticated;
grant select on table public.v_invent_current_stocks to authenticated;

do $$
declare
  v_table text;
  v_policy record;
begin
  foreach v_table in array array[
    'invent_audit_logs',
    'invent_categories',
    'invent_child_assets',
    'invent_fiscal_snapshots',
    'invent_inventory_count_items',
    'invent_inventory_counts',
    'invent_order_requests',
    'invent_parent_assets',
    'invent_staff',
    'invent_stock_movements',
    'invent_suppliers'
  ] loop
    if to_regclass(format('public.%I', v_table)) is not null then
      execute format('revoke all on table public.%I from public, anon', v_table);
    end if;
  end loop;

  -- These existing UPDATE policies had accidentally included the anon role.
  for v_policy in
    select c.relname as table_name, p.polname as policy_name
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and (
        (c.relname = 'invent_child_assets' and p.polname = 'invent_child_assets_authenticated_update')
        or (c.relname = 'invent_stock_movements' and p.polname = 'invent_stock_movements_authenticated_update')
      )
  loop
    execute format('alter policy %I on public.%I to authenticated', v_policy.policy_name, v_policy.table_name);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
commit;
