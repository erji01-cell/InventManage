-- 年度更新を1トランザクションで実行するRPC関数。
-- Supabase SQL Editor でこのファイル全体を実行して導入する。
--
-- 目的: 従来はブラウザから資産1件ずつPATCH（541リクエスト直列）していたため、
--       途中でブラウザが閉じる・通信が切れると一部の資産だけ締まった
--       中途半端な状態になり得た。本関数はスナップショット保存と
--       期首在庫更新を単一トランザクションで行い、全て成功か全て失敗かの
--       どちらかしか起きないようにする。
--
-- 使い方:
--   dry_run = true  … 何も書き込まず、計算結果（資産ごとの期首/期末）だけ返す
--   dry_run = false … スナップショット保存 + opening_stock / fiscal_year_closed_at 更新
--
-- アプリ側は「クライアント計算と dry_run 結果を突き合わせて一致を確認してから
-- 本実行する」二段構えで呼び出す。

create or replace function public.invent_year_end_update(end_date date, dry_run boolean default true)
returns jsonb
language plpgsql
as $$
declare
  fy int;
  result jsonb;
begin
  if end_date is null then
    raise exception '期末日が指定されていません';
  end if;

  -- 既に end_date より後の日付で締められた資産がある場合は巻き戻しになるため拒否
  if exists (
    select 1 from public.invent_child_assets
    where fiscal_year_closed_at is not null and fiscal_year_closed_at > end_date
  ) then
    raise exception '期末日 % より後の日付で締め済みの資産が存在します。期末日を確認してください。', end_date;
  end if;

  -- 会計年度は7月開始（7〜12月→その年、1〜6月→前年）
  fy := case when extract(month from end_date) >= 7
             then extract(year from end_date)::int
             else extract(year from end_date)::int - 1 end;

  if dry_run then
    -- 計算のみ（書き込みなし）
    with calc as (
      select
        a.id as child_asset_id,
        a.opening_stock as opening,
        a.opening_stock
          + coalesce(sum(case when m.movement_type = 'in'  then m.quantity else 0 end), 0)
          - coalesce(sum(case when m.movement_type = 'out' then m.quantity else 0 end), 0)
          as closing
      from public.invent_child_assets a
      left join public.invent_stock_movements m
        on m.child_asset_id = a.id
       and m.movement_date <= end_date
       and (a.fiscal_year_closed_at is null or m.movement_date > a.fiscal_year_closed_at)
      where a.is_active is distinct from false  -- クライアントと同様、有効資産のみ対象
      group by a.id, a.opening_stock
    )
    select jsonb_build_object(
      'dry_run', true,
      'fiscal_year', fy,
      'end_date', end_date,
      'asset_count', count(*),
      'changed_count', count(*) filter (where opening is distinct from closing),
      'rows', coalesce(jsonb_agg(
        jsonb_build_object('id', child_asset_id, 'opening', opening, 'closing', closing)
        order by child_asset_id), '[]'::jsonb)
    ) into result
    from calc;
    return result;
  end if;

  -- 本実行: スナップショット保存 + 期首在庫更新を単一ステートメントで（原子的）
  with calc as (
    select
      a.id as child_asset_id,
      a.opening_stock as opening,
      a.opening_stock
        + coalesce(sum(case when m.movement_type = 'in'  then m.quantity else 0 end), 0)
        - coalesce(sum(case when m.movement_type = 'out' then m.quantity else 0 end), 0)
        as closing
    from public.invent_child_assets a
    left join public.invent_stock_movements m
      on m.child_asset_id = a.id
     and m.movement_date <= end_date
     and (a.fiscal_year_closed_at is null or m.movement_date > a.fiscal_year_closed_at)
    where a.is_active is distinct from false
    group by a.id, a.opening_stock
  ),
  snap as (
    insert into public.invent_fiscal_snapshots
      (child_asset_id, fiscal_year, opening_stock, closing_stock, closed_at)
    select child_asset_id, fy, opening, closing, end_date
    from calc
    on conflict (child_asset_id, fiscal_year)
    do update set
      opening_stock = excluded.opening_stock,
      closing_stock = excluded.closing_stock,
      closed_at     = excluded.closed_at
    returning 1
  ),
  upd as (
    update public.invent_child_assets a
       set opening_stock = c.closing,
           fiscal_year_closed_at = end_date
      from calc c
     where a.id = c.child_asset_id
    returning 1
  )
  select jsonb_build_object(
    'dry_run', false,
    'fiscal_year', fy,
    'end_date', end_date,
    'asset_count', (select count(*) from calc),
    'changed_count', (select count(*) filter (where opening is distinct from closing) from calc),
    'snapshot_count', (select count(*) from snap),
    'updated_count', (select count(*) from upd),
    'rows', coalesce((select jsonb_agg(
      jsonb_build_object('id', child_asset_id, 'opening', opening, 'closing', closing)
      order by child_asset_id) from calc), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;
