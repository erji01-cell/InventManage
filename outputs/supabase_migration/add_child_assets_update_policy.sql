drop policy if exists "invent_child_assets_authenticated_update" on invent_child_assets;

create policy "invent_child_assets_authenticated_update"
on invent_child_assets
for update
to authenticated
using (true)
with check (true);
