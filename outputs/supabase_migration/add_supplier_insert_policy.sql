-- 資産マスターから新しい取引先を登録できるようにする。
-- Supabase SQL Editorでこのファイル全体を1回実行する。

alter table public.invent_suppliers enable row level security;

drop policy if exists "invent_suppliers_authenticated_insert"
  on public.invent_suppliers;

create policy "invent_suppliers_authenticated_insert"
  on public.invent_suppliers
  for insert
  to authenticated
  with check (auth.uid() is not null);

-- CSV移行後のID最大値にシーケンスを合わせ、新規登録時のID重複を防ぐ。
select setval(
  pg_get_serial_sequence('public.invent_suppliers', 'id'),
  coalesce((select max(id) from public.invent_suppliers), 1),
  exists(select 1 from public.invent_suppliers)
);
