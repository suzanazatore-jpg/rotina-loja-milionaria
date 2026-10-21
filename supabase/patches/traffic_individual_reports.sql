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
-- Server-only transaction: replace the entire set of approved account memberships atomically.
create or replace function public.replace_traffic_memberships(p_user_id uuid,p_client_ids uuid[],p_expected_ids uuid[])
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare current_ids uuid[];
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
 select coalesce(array_agg(client_id order by client_id),'{}') into current_ids from traffic_client_users where user_id=p_user_id;
 if current_ids is distinct from (select coalesce(array_agg(x order by x),'{}') from unnest(p_expected_ids) x) then raise exception 'Membership changed; reload' using errcode='40001'; end if;
 if exists(select 1 from unnest(p_client_ids) x where not exists(select 1 from traffic_clients where id=x and active)) then raise exception 'Inactive account'; end if;
 delete from traffic_client_users where user_id=p_user_id and not(client_id=any(p_client_ids));
 insert into traffic_client_users(user_id,client_id) select p_user_id,x from unnest(p_client_ids) x on conflict do nothing;
end $$;
revoke all on function public.replace_traffic_memberships(uuid,uuid[],uuid[]) from public,anon,authenticated;
grant execute on function public.replace_traffic_memberships(uuid,uuid[],uuid[]) to service_role;

-- Permit authenticated deep links to a client's own traffic report in the existing notification center.
alter table public.user_notifications drop constraint if exists user_notifications_target_url_check;
alter table public.user_notifications add constraint user_notifications_target_url_check check(target_url='/painel' or target_url like '/painel?%' or target_url like '/painel/%' or target_url like '/protocolo/%' or target_url='/trafego' or target_url like '/trafego?%');
create unique index if not exists user_notifications_traffic_unique on public.user_notifications(user_id,rule_id) where rule_id like 'traffic-%';
-- Existing membership policies are permissive. Add an eligibility gate for direct Data API reads.
-- No SECURITY DEFINER helper: ownership and active entitlement remain part of the SELECT policy.
do $$
declare tbl text; ownership text; eligible text;
begin
 eligible := $gate$((select auth.jwt()->>'email')='suporte@suzanazatorre.com.br' or (
 exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.status='active')
 and exists(select 1 from public.profile_plans pp join public.plans pl on pl.id=pp.plan_id where pp.profile_id=(select auth.uid()) and pl.offer_id::text in ('1773344369','1715729806'))
 and not exists(select 1 from public.perfis pf where pf.id=(select auth.uid()) and (pf.status_assinatura in ('reembolsado','cancelado','blocked','inactive','expired') or pf.acesso_expira_em < (now() at time zone 'America/Sao_Paulo')::date))
 ))$gate$;
 foreach tbl in array array['traffic_clients','traffic_daily_metrics','traffic_reports'] loop
   execute format('drop policy if exists traffic_active_entitlement_gate on public.%I',tbl);
   execute format('create policy traffic_active_entitlement_gate on public.%I as restrictive for select to authenticated using (%s)',tbl,eligible);
 end loop;
 drop policy if exists traffic_report_publication_gate on public.traffic_reports;
 create policy traffic_report_publication_gate on public.traffic_reports as restrictive for select to authenticated using ((select auth.jwt()->>'email')='suporte@suzanazatorre.com.br' or (published_at is not null and published_at<=now()));
end $$;
