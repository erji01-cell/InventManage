drop policy if exists "invent_parent_assets_authenticated_update" on invent_parent_assets;

create policy "invent_parent_assets_authenticated_update"
on invent_parent_assets
for update
to authenticated
using (true)
with check (true);
