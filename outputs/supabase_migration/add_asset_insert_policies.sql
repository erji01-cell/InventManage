drop policy if exists "invent_parent_assets_authenticated_insert" on invent_parent_assets;
create policy "invent_parent_assets_authenticated_insert"
on invent_parent_assets
for insert
to authenticated
with check (true);

drop policy if exists "invent_child_assets_authenticated_insert" on invent_child_assets;
create policy "invent_child_assets_authenticated_insert"
on invent_child_assets
for insert
to authenticated
with check (true);
