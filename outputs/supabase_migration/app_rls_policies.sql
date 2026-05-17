alter table invent_suppliers enable row level security;
alter table invent_staff enable row level security;
alter table invent_parent_assets enable row level security;
alter table invent_child_assets enable row level security;
alter table invent_stock_movements enable row level security;

drop policy if exists "invent_suppliers_anon_select" on invent_suppliers;
create policy "invent_suppliers_anon_select"
on invent_suppliers
for select
to anon
using (true);

drop policy if exists "invent_staff_anon_select" on invent_staff;
create policy "invent_staff_anon_select"
on invent_staff
for select
to anon
using (true);

drop policy if exists "invent_parent_assets_anon_select" on invent_parent_assets;
create policy "invent_parent_assets_anon_select"
on invent_parent_assets
for select
to anon
using (true);

drop policy if exists "invent_child_assets_anon_select" on invent_child_assets;
create policy "invent_child_assets_anon_select"
on invent_child_assets
for select
to anon
using (true);

drop policy if exists "invent_stock_movements_anon_select" on invent_stock_movements;
create policy "invent_stock_movements_anon_select"
on invent_stock_movements
for select
to anon
using (true);

drop policy if exists "invent_stock_movements_anon_insert" on invent_stock_movements;
create policy "invent_stock_movements_anon_insert"
on invent_stock_movements
for insert
to anon
with check (true);

drop policy if exists "invent_stock_movements_anon_delete" on invent_stock_movements;
create policy "invent_stock_movements_anon_delete"
on invent_stock_movements
for delete
to anon
using (true);
