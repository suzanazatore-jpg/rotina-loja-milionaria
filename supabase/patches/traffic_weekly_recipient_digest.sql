-- One weekly delivery per recipient and channel; account reports remain separate.
alter table public.traffic_report_deliveries add column if not exists batch_key text;
alter table public.traffic_report_deliveries add column if not exists report_ids uuid[] not null default '{}';
alter table public.traffic_report_deliveries drop constraint traffic_delivery_report_or_test;
alter table public.traffic_report_deliveries add constraint traffic_delivery_report_or_test check (
  (test_id is not null and report_id is null and batch_key is null)
  or (test_id is null and (report_id is not null or batch_key is not null))
);
create unique index if not exists traffic_weekly_delivery_once
  on public.traffic_report_deliveries (user_id, channel, batch_key) where batch_key is not null;

-- Claim the period using an existing delivery, without erasing receipts or sending anything.
with prior as (
 select d.id,d.user_id,d.channel,d.status,d.created_at,r.id as included_report,
        'weekly:'||r.period_start::text||':'||r.period_end::text as period_key
 from public.traffic_report_deliveries d
 join public.traffic_reports r on r.id=d.report_id
 where r.period_type='weekly' and d.test_id is null
), grouped as (
 select user_id,channel,period_key,array_agg(distinct included_report) as included_reports,
 (array_agg(id order by case when status in ('processing','unknown') then 0 when status in ('sent','accepted') then 1 when status='failed' then 2 when status='skipped' then 3 else 4 end,created_at,id))[1] as anchor_id
 from prior group by user_id,channel,period_key
)
update public.traffic_report_deliveries d set batch_key=g.period_key,report_ids=g.included_reports
from grouped g where d.id=g.anchor_id and d.batch_key is null
and not exists (select 1 from public.traffic_report_deliveries other where other.user_id=g.user_id and other.channel=g.channel and other.batch_key=g.period_key);
alter table public.traffic_report_deliveries add constraint traffic_weekly_batch_reports check (batch_key is null or cardinality(report_ids)>0);
