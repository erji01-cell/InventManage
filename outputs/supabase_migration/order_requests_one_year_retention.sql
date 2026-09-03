-- 納品完了データを納品完了日時から1年間だけ保持する。
-- Supabase SQL Editorで1回実行すると、既存データの整理と日次削除を設定する。

create extension if not exists pg_cron with schema pg_catalog;

-- 初回実行時に、納品完了からすでに1年を超えているデータを整理する。
delete from public.invent_order_requests
where status = 'delivered'
  and delivered_at < now() - interval '1 year';

-- 再実行しても同じジョブが重複しないよう、既存ジョブを解除する。
do $$
declare
  existing_job record;
begin
  for existing_job in
    select jobid
    from cron.job
    where jobname = 'invent-order-requests-one-year-retention'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
end
$$;

-- 毎日03:10（日本時間、18:10 UTC）に納品完了から1年超のデータを削除する。
select cron.schedule(
  'invent-order-requests-one-year-retention',
  '10 18 * * *',
  $$
    delete from public.invent_order_requests
    where status = 'delivered'
      and delivered_at < now() - interval '1 year';
  $$
);
