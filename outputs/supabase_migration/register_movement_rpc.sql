-- 入出庫登録を「在庫チェック＋登録」の1トランザクションで行うRPC関数。
-- Supabase SQL Editor でこのファイル全体を実行して導入する。
--
-- 目的: 出庫の在庫チェックは従来クライアント側のみで、複数PCが同時に
--       同じ資産を出庫すると両方通ってしまい在庫がマイナスになり得た。
--       本関数は対象資産の行をロックして直列化し、最新在庫をDB側で
--       計算してから登録する。同時出庫でも後の1件は正しく弾かれる。
--
-- 挙動:
--   - 'out' は在庫不足なら例外（登録されない）。'in' は在庫チェックなし
--   - 締め済み期間（fiscal_year_closed_at 以前）への登録はDB側でも拒否
--   - 成功時は登録した行を返す（従来の return=representation と同じ形）

create or replace function public.invent_register_movement(
  p_child_asset_id bigint,
  p_movement_date date,
  p_movement_type text,
  p_quantity numeric,
  p_actual_delivery_price numeric default 0,
  p_expiration_date date default null,
  p_lot_number text default null,
  p_staff_code int default null,
  p_staff_name text default null,
  p_memo text default null
)
returns setof public.invent_stock_movements
language plpgsql
as $$
declare
  v_asset public.invent_child_assets%rowtype;
  v_stock numeric;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception '数量は1以上で入力してください。';
  end if;
  if p_movement_type not in ('in', 'out') then
    raise exception '入出庫区分が不正です: %', p_movement_type;
  end if;
  if p_movement_date is null then
    raise exception '入出庫日を指定してください。';
  end if;

  -- 対象資産の行をロックして直列化（複数PCの同時出庫を1件ずつ処理する）
  select * into v_asset
  from public.invent_child_assets
  where id = p_child_asset_id
  for update;

  if not found then
    raise exception '資産コード % が見つかりません。', p_child_asset_id;
  end if;

  -- 締め済み期間への登録はサーバー側でも拒否（アプリ側ガードの二重化）
  if v_asset.fiscal_year_closed_at is not null
     and p_movement_date <= v_asset.fiscal_year_closed_at then
    raise exception 'この資産は % まで年度更新で締め済みです。それ以降の日付で入力してください。',
      v_asset.fiscal_year_closed_at;
  end if;

  -- 出庫のみ: 最新在庫（期首 + 締め後の入庫 − 出庫）をロック下で計算してチェック
  if p_movement_type = 'out' then
    select v_asset.opening_stock
      + coalesce(sum(case when m.movement_type = 'in' then m.quantity else -m.quantity end), 0)
    into v_stock
    from public.invent_stock_movements m
    where m.child_asset_id = p_child_asset_id
      and (v_asset.fiscal_year_closed_at is null
           or m.movement_date > v_asset.fiscal_year_closed_at);

    if v_stock - p_quantity < 0 then
      raise exception '出庫数が現在庫（%）を超えています。在庫がマイナスになるため登録できません。', v_stock;
    end if;
  end if;

  return query
  insert into public.invent_stock_movements
    (child_asset_id, movement_date, movement_type, quantity, actual_delivery_price,
     expiration_date, lot_number, staff_code, staff_name, memo)
  values
    (p_child_asset_id, p_movement_date, p_movement_type, p_quantity,
     case when p_movement_type = 'in' then coalesce(p_actual_delivery_price, 0) else 0 end,
     p_expiration_date, p_lot_number, p_staff_code, p_staff_name, p_memo)
  returning *;
end;
$$;
