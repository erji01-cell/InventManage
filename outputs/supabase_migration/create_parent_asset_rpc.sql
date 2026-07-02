-- 親資産（P-xxxx）の採番と登録を1トランザクションで行うRPC関数。
-- Supabase SQL Editor でこのファイル全体を実行して導入する。
--
-- 目的: 従来は「最大IDを読む → +1 して INSERT」の2ステップをクライアントが
--       行っていたため、2台のPCがほぼ同時に新規資産を登録すると同じIDで
--       INSERTして片方が主キー重複エラーになり得た。
--       本関数はアドバイザリロックで採番を直列化し、重複を防ぐ。
--
-- 付随修正: 従来の最大ID取得はテキスト順（order=id.desc）だったため、
--       P-9999 を超えると誤った最大値を返す問題があった。本関数は
--       数値として最大を計算するため、桁が増えても正しく採番される。

create or replace function public.invent_create_parent_asset(
  p_category text,
  p_category_id int,
  p_generic_name text default null
)
returns setof public.invent_parent_assets
language plpgsql
as $$
declare
  v_next int;
  v_id text;
begin
  if p_category_id is null then
    raise exception '分類を指定してください。';
  end if;

  -- 採番を直列化（複数PCが同時に新規登録しても同じIDにならない）。
  -- ロックはトランザクション終了時に自動解放される。
  perform pg_advisory_xact_lock(hashtext('invent_parent_assets_id'));

  select coalesce(max((substring(id from 3))::int), 0) + 1
    into v_next
  from public.invent_parent_assets
  where id ~ '^P-[0-9]+$';

  v_id := 'P-' || lpad(v_next::text, 4, '0');

  return query
  insert into public.invent_parent_assets (id, category, category_id, generic_name, safety_stock)
  values (v_id, p_category, p_category_id, p_generic_name, null)
  returning *;
end;
$$;
