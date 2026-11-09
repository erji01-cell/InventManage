-- ログイン済みユーザーに分類（invent_categories）の削除を許可する。
-- 既存データは変更しない。何度実行しても安全。
grant delete on table public.invent_categories to authenticated;

drop policy if exists "invent_categories_authenticated_delete" on public.invent_categories;
create policy "invent_categories_authenticated_delete"
  on public.invent_categories
  for delete
  to authenticated
  using (true);
