alter table invent_child_assets
add column if not exists pack_size integer default 1;
