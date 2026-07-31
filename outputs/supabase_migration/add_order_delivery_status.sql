-- 既存の発注依頼テーブルへ「納品完了」状態と完了情報を追加する。
alter table public.invent_order_requests
  add column if not exists delivered_by text,
  add column if not exists delivered_at timestamptz;

alter table public.invent_order_requests
  drop constraint if exists invent_order_requests_status_check;

alter table public.invent_order_requests
  add constraint invent_order_requests_status_check
  check (status in ('requested', 'completed', 'delivered', 'cancelled'));
