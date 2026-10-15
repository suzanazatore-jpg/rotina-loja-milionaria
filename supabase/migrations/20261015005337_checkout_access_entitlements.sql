-- Separate purchase provenance; existing enrollment tables and Guru handler stay intact.
create table public.checkout_access_accounts (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  baseline jsonb not null,
  expected jsonb not null,
  new_profile boolean not null default false,
  updated_at timestamptz not null default now()
);
create table public.checkout_access_grants (
  order_id uuid primary key references public.orders(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  grants jsonb not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  reason text check (reason in ('refunded','chargedback','expired')),
  created_at timestamptz not null default now()
);
create index checkout_access_grants_profile on public.checkout_access_grants(profile_id);
create index checkout_access_grants_expiration on public.checkout_access_grants(expires_at) where revoked_at is null;
alter table public.checkout_access_accounts enable row level security;
alter table public.checkout_access_grants enable row level security;
revoke all on public.checkout_access_accounts, public.checkout_access_grants from public, anon, authenticated;
grant select,insert,update,delete on public.checkout_access_accounts, public.checkout_access_grants to service_role;

create function public.checkout_access_snapshot(p_profile uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
select jsonb_build_object(
 'legacy',(select jsonb_build_object('tipo_acesso',tipo_acesso,'acesso_expira_em',acesso_expira_em,'status_assinatura',status_assinatura) from public.perfis where id=p_profile),
 'profile',(select jsonb_build_object('status',status,'role',role) from public.profiles where id=p_profile),
 'enrollments',coalesce((select jsonb_agg(to_jsonb(e) order by e.id) from public.enrollments e where profile_id=p_profile),'[]'::jsonb),
 'plans',coalesce((select jsonb_agg(to_jsonb(p) order by p.plan_id) from public.profile_plans p where profile_id=p_profile),'[]'::jsonb)
);
$$;

create function public.checkout_apply_access(p_order uuid, p_profile uuid, p_plans uuid[] default null, p_new_profile boolean default false) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
 o public.orders%rowtype;
 a public.checkout_access_accounts%rowtype;
 g public.checkout_access_grants%rowtype;
 snapshot jsonb;
 entries jsonb;
 entry jsonb;
 base_row jsonb;
 course uuid;
 course_exp timestamptz;
 max_exp timestamptz;
 base_exp date;
 legacy_valid boolean;
 desired_status text;
 desired_exp timestamptz;
 active_plans uuid[];
 baseline_plans uuid[];
 v_reason text;
begin
 select * into strict o from public.orders where id=p_order for update;
 if not (o.event_id like 'checkout:%' or o.event_id like 'cycle:%') then raise exception 'Unsupported order origin'; end if;
 if not exists(select 1 from public.customers c join public.profiles p on p.id=p_profile where c.id=o.customer_id and lower(c.email)=lower(p.email)) then raise exception 'Profile does not match buyer'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_profile::text, 0));
 perform 1 from public.perfis where id=p_profile for update;
 perform 1 from public.profiles where id=p_profile for update;
 perform 1 from public.enrollments where profile_id=p_profile for update;
 perform 1 from public.profile_plans where profile_id=p_profile for update;
 snapshot := public.checkout_access_snapshot(p_profile);
 select * into a from public.checkout_access_accounts where profile_id=p_profile for update;
 select * into g from public.checkout_access_grants where order_id=p_order;
 if p_plans is null and g.order_id is null then return jsonb_build_object('status','review_required','reason','missing_provenance'); end if;
 if a.profile_id is not null and a.expected is distinct from snapshot then return jsonb_build_object('status','review_required','reason','external_access_change'); end if;
 if snapshot->'legacy' = 'null'::jsonb or snapshot->'profile'->>'status' <> 'active' then return jsonb_build_object('status','review_required','reason','profile_not_active'); end if;
 if p_plans is not null then
   if o.status::text <> 'paid' or o.paid_at is null then raise exception 'Order is not paid'; end if;
   if g.revoked_at is not null then return jsonb_build_object('status','review_required','reason','previously_revoked'); end if;
   if coalesce(cardinality(p_plans),0)=0 or (select count(*) from public.plans where id=any(p_plans) and period_days>0)<>cardinality(p_plans) then raise exception 'Invalid plans'; end if;
   if a.profile_id is null then
     insert into public.checkout_access_accounts(profile_id,baseline,expected,new_profile) values(p_profile,snapshot,snapshot,p_new_profile) returning * into a;
   end if;
   if g.order_id is null then
     select jsonb_agg(jsonb_build_object('plan_id',p.id,'expires_at',o.paid_at+(p.period_days * interval '1 day'),'courses',coalesce((select jsonb_agg(course_id order by course_id) from public.plan_courses where plan_id=p.id),'[]'::jsonb)) order by p.id), max(o.paid_at+(p.period_days * interval '1 day')) into entries,max_exp from public.plans p where p.id=any(p_plans);
     insert into public.checkout_access_grants(order_id,profile_id,grants,expires_at) values(p_order,p_profile,entries,max_exp);
   elsif g.profile_id <> p_profile then raise exception 'Grant owner mismatch';
   end if;
 else
   v_reason := case when o.status::text in ('refunded','chargedback') then o.status::text when g.expires_at<=now() then 'expired' else null end;
   if v_reason is null then return jsonb_build_object('status','unchanged'); end if;
   update public.checkout_access_grants set revoked_at=coalesce(revoked_at,now()),reason=coalesce(checkout_access_grants.reason,v_reason) where order_id=p_order;
 end if;
 -- Only the saved baseline and non-revoked paid purchases contribute to access.
 select coalesce(jsonb_agg(item),'[]'::jsonb), max((item->>'expires_at')::timestamptz) into entries,max_exp
 from public.checkout_access_grants r cross join lateral jsonb_array_elements(r.grants) item
 where r.profile_id=p_profile and r.revoked_at is null and (item->>'expires_at')::timestamptz>now();
 for course in
   select distinct (x->>'course_id')::uuid from jsonb_array_elements(a.baseline->'enrollments') x
   union select distinct c::text::uuid from jsonb_array_elements(entries) x cross join lateral jsonb_array_elements_text(x->'courses') c
   union select course_id from public.enrollments where profile_id=p_profile and source='checkout_ledger'
 loop
   select max((x->>'expires_at')::timestamptz) into course_exp from jsonb_array_elements(entries) x where x->'courses' @> jsonb_build_array(course::text);
   if exists(select 1 from jsonb_array_elements(a.baseline->'enrollments') x where (x->>'course_id')::uuid=course) then
     for base_row in select x from jsonb_array_elements(a.baseline->'enrollments') x where (x->>'course_id')::uuid=course loop
       desired_status := base_row->>'status';
       desired_exp := (base_row->>'expires_at')::timestamptz;
       if course_exp is not null then
         if desired_status<>'active' then desired_exp:=course_exp;
         elsif desired_exp is not null then desired_exp:=greatest(desired_exp,course_exp); end if;
         desired_status:='active';
       end if;
       update public.enrollments set status=desired_status,expires_at=desired_exp,updated_at=now() where id=(base_row->>'id')::uuid and (status,expires_at) is distinct from (desired_status,desired_exp);
     end loop;
   else
     if exists(select 1 from public.enrollments where profile_id=p_profile and course_id=course and source='checkout_ledger') then
       update public.enrollments set status=case when course_exp is null then 'refunded' else 'active' end,expires_at=coalesce(course_exp,now()),updated_at=now() where profile_id=p_profile and course_id=course and source='checkout_ledger';
     elsif course_exp is not null then
       insert into public.enrollments(profile_id,course_id,status,source,purchased_at,expires_at) values(p_profile,course,'active','checkout_ledger',o.paid_at,course_exp);
     end if;
   end if;
 end loop;
 select coalesce(array_agg(distinct (x->>'plan_id')::uuid),'{}'::uuid[]) into active_plans from jsonb_array_elements(entries) x;
 select coalesce(array_agg((x->>'plan_id')::uuid),'{}'::uuid[]) into baseline_plans from jsonb_array_elements(a.baseline->'plans') x;
 delete from public.profile_plans where profile_id=p_profile and not(plan_id=any(active_plans||baseline_plans));
 insert into public.profile_plans(profile_id,plan_id) select p_profile,unnest(active_plans||baseline_plans) on conflict do nothing;
 base_exp := (a.baseline->'legacy'->>'acesso_expira_em')::date;
 legacy_valid := not a.new_profile and coalesce(a.baseline->'legacy'->>'status_assinatura','ativo') not in ('cancelado','atrasado','reembolsado','reembolsada','refunded') and (base_exp is null or base_exp>=current_date);
 update public.perfis set
   acesso_expira_em=case when legacy_valid and base_exp is null then null else greatest(base_exp,(max_exp at time zone 'America/Sao_Paulo')::date, case when max_exp is null and not legacy_valid then current_date-1 else null end) end,
   status_assinatura=case when max_exp is not null or legacy_valid then 'ativo' else 'cancelado' end
 where id=p_profile;
 update public.checkout_access_accounts set expected=public.checkout_access_snapshot(p_profile),updated_at=now() where profile_id=p_profile;
 return jsonb_build_object('status','completed');
end;
$$;
revoke all on function public.checkout_access_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.checkout_apply_access(uuid,uuid,uuid[],boolean) from public, anon, authenticated;
grant execute on function public.checkout_access_snapshot(uuid),public.checkout_apply_access(uuid,uuid,uuid[],boolean) to service_role;
