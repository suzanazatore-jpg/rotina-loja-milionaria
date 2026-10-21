-- Additive tables; existing approvals and reports remain unchanged.
create table if not exists public.traffic_report_deliveries (
 id uuid primary key default gen_random_uuid(),
 report_id uuid not null references public.traffic_reports(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 channel text not null check(channel in ('app','push','email','whatsapp')),
 status text not null default 'pending' check(status in ('pending','processing','sent','accepted','failed','unknown','skipped')),
 provider_id text, error_message text, attempted_at timestamptz, sent_at timestamptz,
 created_at timestamptz not null default now(), unique(report_id,user_id,channel)
);
alter table public.traffic_report_deliveries enable row level security;
revoke all on public.traffic_report_deliveries from anon,authenticated;
grant all on public.traffic_report_deliveries to service_role;
create index if not exists traffic_report_deliveries_user_idx on public.traffic_report_deliveries(user_id);
create index if not exists traffic_report_deliveries_pending_idx on public.traffic_report_deliveries(status,created_at);
create table if not exists public.traffic_report_settings (
 id boolean primary key default true check(id),
 weekly_enabled boolean not null default false,
 push_enabled boolean not null default true,
 email_enabled boolean not null default true,
 whatsapp_enabled boolean not null default true,
 updated_at timestamptz not null default now()
);
alter table public.traffic_report_settings enable row level security;
revoke all on public.traffic_report_settings from anon,authenticated;
grant all on public.traffic_report_settings to service_role;
insert into public.traffic_report_settings(id) values(true) on conflict do nothing;

alter table public.user_notifications drop constraint if exists user_notifications_target_url_check;
alter table public.user_notifications add constraint user_notifications_target_url_check check(target_url='/painel' or target_url like '/painel?%' or target_url like '/painel/%' or target_url like '/protocolo/%' or target_url='/trafego' or target_url like '/trafego?%');
create unique index if not exists user_notifications_traffic_unique on public.user_notifications(user_id,rule_id) where rule_id like 'traffic-%';
alter table public.traffic_report_deliveries alter column report_id drop not null;
alter table public.traffic_report_deliveries add column if not exists test_id uuid;
alter table public.traffic_report_deliveries add constraint traffic_delivery_report_or_test check ((report_id is not null and test_id is null) or (report_id is null and test_id is not null));
create unique index traffic_internal_test_once on public.traffic_report_deliveries(user_id,channel,test_id) where test_id is not null;
