-- 入出庫データ詳細の更新を、在庫チェックと同じトランザクションで行う。
-- 対象資産や区分を変更する場合は、変更元・変更先の両方について
-- 更新後在庫がマイナスにならないことを確認してから保存する。

create or replace function public.invent_update_movement(
  p_id bigint,
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
  v_original public.invent_stock_movements%rowtype;
  v_old_asset public.invent_child_assets%rowtype;
  v_target_asset public.invent_child_assets%rowtype;
  v_old_stock numeric;
  v_target_stock numeric;
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

  select * into v_original
  from public.invent_stock_movements
  where id = p_id
  for update;

  if not found then
    raise exception '入出庫データ ID % が見つかりません。', p_id;
  end if;

  -- 複数端末から同時更新されても計算がずれないよう、資産行をID順にロックする。
  perform 1
  from public.invent_child_assets
  where id in (v_original.child_asset_id, p_child_asset_id)
  order by id
  for update;

  select * into v_old_asset
  from public.invent_child_assets
  where id = v_original.child_asset_id;

  select * into v_target_asset
  from public.invent_child_assets
  where id = p_child_asset_id;

  if v_target_asset.id is null then
    raise exception '資産コード % が見つかりません。', p_child_asset_id;
  end if;

  if v_old_asset.fiscal_year_closed_at is not null
     and v_original.movement_date <= v_old_asset.fiscal_year_closed_at then
    raise exception 'この入出庫データは % まで年度更新で締め済みのため編集できません。',
      v_old_asset.fiscal_year_closed_at;
  end if;

  if v_target_asset.fiscal_year_closed_at is not null
     and p_movement_date <= v_target_asset.fiscal_year_closed_at then
    raise exception '変更後の入出庫日は % より後の日付を指定してください。',
      v_target_asset.fiscal_year_closed_at;
  end if;

  -- 元の行を除外した在庫に、変更後の内容だけを加えて結果を検証する。
  select coalesce(v_old_asset.opening_stock, 0)
    + coalesce(sum(case when m.movement_type = 'in' then m.quantity else -m.quantity end), 0)
  into v_old_stock
  from public.invent_stock_movements m
  where m.child_asset_id = v_old_asset.id
    and m.id <> p_id
    and (v_old_asset.fiscal_year_closed_at is null
         or m.movement_date > v_old_asset.fiscal_year_closed_at);

  if v_old_asset.id = v_target_asset.id then
    v_old_stock := v_old_stock
      + case when p_movement_type = 'in' then p_quantity else -p_quantity end;
  end if;

  if v_old_stock < 0 then
    raise exception '変更元の資産は更新後在庫が % となり、マイナスになるため保存できません。',
      v_old_stock;
  end if;

  if v_old_asset.id <> v_target_asset.id then
    select coalesce(v_target_asset.opening_stock, 0)
      + coalesce(sum(case when m.movement_type = 'in' then m.quantity else -m.quantity end), 0)
    into v_target_stock
    from public.invent_stock_movements m
    where m.child_asset_id = v_target_asset.id
      and (v_target_asset.fiscal_year_closed_at is null
           or m.movement_date > v_target_asset.fiscal_year_closed_at);

    v_target_stock := v_target_stock
      + case when p_movement_type = 'in' then p_quantity else -p_quantity end;

    if v_target_stock < 0 then
      raise exception '変更先の資産は更新後在庫が % となり、マイナスになるため保存できません。',
        v_target_stock;
    end if;
  end if;

  return query
  update public.invent_stock_movements
  set child_asset_id = p_child_asset_id,
      movement_date = p_movement_date,
      movement_type = p_movement_type,
      quantity = p_quantity,
      actual_delivery_price = case
        when p_movement_type = 'in' then coalesce(p_actual_delivery_price, 0)
        else 0
      end,
      expiration_date = p_expiration_date,
      lot_number = p_lot_number,
      staff_code = p_staff_code,
      staff_name = p_staff_name,
      memo = p_memo
  where id = p_id
  returning *;
end;
$$;
