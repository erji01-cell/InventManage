-- 既存の発注依頼テーブルに、ログインユーザーの削除権限を追加する。
alter table public.invent_order_requests enable row level security;

drop policy if exists "invent_order_requests_authenticated_delete"
  on public.invent_order_requests;

create policy "invent_order_requests_authenticated_delete"
  on public.invent_order_requests
  for delete
  to authenticated
  using (auth.uid() is not null);
