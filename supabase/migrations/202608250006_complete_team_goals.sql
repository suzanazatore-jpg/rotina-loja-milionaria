alter table public.sales_goals
  add column if not exists weekday_weights jsonb not null default '{"0":0,"1":10,"2":10,"3":12,"4":15,"5":23,"6":30}'::jsonb,
  add column if not exists closed_dates date[] not null default '{}'::date[];

create table if not exists public.salesperson_goals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  salesperson_id uuid not null,
  month_start date not null check (extract(day from month_start) = 1),
  target_amount numeric not null default 0 check (target_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint salesperson_goals_person_owner_fk
    foreign key (salesperson_id, owner_id)
    references public.salespeople(id, owner_id) on delete cascade,
  constraint salesperson_goals_person_month_unique unique (salesperson_id, month_start)
);

create index if not exists salesperson_goals_owner_month_idx
  on public.salesperson_goals(owner_id, month_start);
create index if not exists salesperson_goals_person_owner_idx
  on public.salesperson_goals(salesperson_id, owner_id);

alter table public.salesperson_goals enable row level security;

grant select, insert, update, delete on public.salesperson_goals to authenticated;
grant select, insert, update, delete on public.salesperson_goals to service_role;

drop policy if exists "salesperson_goals_owner_manage" on public.salesperson_goals;
create policy "salesperson_goals_owner_manage"
  on public.salesperson_goals for all
  to authenticated
  using (
    (select auth.uid()) = owner_id and (
      (auth.jwt() ->> 'email') = 'suporte@suzanazatorre.com.br' or exists (
        select 1 from public.profile_plans pp join public.plan_app_contents pac on pac.plan_id = pp.plan_id join public.profiles p on p.id = pp.profile_id
        where pp.profile_id = (select auth.uid()) and pac.content_key = 'team_goals' and p.status = 'active'
      )
    )
  )
  with check (
    (select auth.uid()) = owner_id and (
      (auth.jwt() ->> 'email') = 'suporte@suzanazatorre.com.br' or exists (
        select 1 from public.profile_plans pp join public.plan_app_contents pac on pac.plan_id = pp.plan_id join public.profiles p on p.id = pp.profile_id
        where pp.profile_id = (select auth.uid()) and pac.content_key = 'team_goals' and p.status = 'active'
      )
    )
  );

create index if not exists daily_sales_owner_date_idx
  on public.daily_sales(owner_id, sale_date desc);

create index if not exists daily_sales_person_date_idx
  on public.daily_sales(salesperson_id, sale_date desc);
create index if not exists daily_sales_person_owner_idx
  on public.daily_sales(salesperson_id, owner_id);

drop policy if exists "sales_goals_owner_manage" on public.sales_goals;
create policy "sales_goals_plan_access"
  on public.sales_goals for all to authenticated
  using (
    (select auth.uid()) = owner_id and (
      (auth.jwt() ->> 'email') = 'suporte@suzanazatorre.com.br' or exists (
        select 1 from public.profile_plans pp
        join public.plan_app_contents pac on pac.plan_id = pp.plan_id
        join public.profiles p on p.id = pp.profile_id
        where pp.profile_id = (select auth.uid()) and pac.content_key = 'team_goals' and p.status = 'active'
      )
    )
  )
  with check (
    (select auth.uid()) = owner_id and (
      (auth.jwt() ->> 'email') = 'suporte@suzanazatorre.com.br' or exists (
        select 1 from public.profile_plans pp
        join public.plan_app_contents pac on pac.plan_id = pp.plan_id
        join public.profiles p on p.id = pp.profile_id
        where pp.profile_id = (select auth.uid()) and pac.content_key = 'team_goals' and p.status = 'active'
      )
    )
  );

drop policy if exists "salespeople_owner_manage" on public.salespeople;
create policy "salespeople_plan_access"
  on public.salespeople for all to authenticated
  using (
    (select auth.uid()) = owner_id and (
      (auth.jwt() ->> 'email') = 'suporte@suzanazatorre.com.br' or exists (
        select 1 from public.profile_plans pp join public.plan_app_contents pac on pac.plan_id = pp.plan_id join public.profiles p on p.id = pp.profile_id
        where pp.profile_id = (select auth.uid()) and pac.content_key = 'team_goals' and p.status = 'active'
      )
    )
  )
  with check (
    (select auth.uid()) = owner_id and (
      (auth.jwt() ->> 'email') = 'suporte@suzanazatorre.com.br' or exists (
        select 1 from public.profile_plans pp join public.plan_app_contents pac on pac.plan_id = pp.plan_id join public.profiles p on p.id = pp.profile_id
        where pp.profile_id = (select auth.uid()) and pac.content_key = 'team_goals' and p.status = 'active'
      )
    )
  );

drop policy if exists "daily_sales_owner_manage" on public.daily_sales;
create policy "daily_sales_plan_access"
  on public.daily_sales for all to authenticated
  using (
    (select auth.uid()) = owner_id and (
      (auth.jwt() ->> 'email') = 'suporte@suzanazatorre.com.br' or exists (
        select 1 from public.profile_plans pp join public.plan_app_contents pac on pac.plan_id = pp.plan_id join public.profiles p on p.id = pp.profile_id
        where pp.profile_id = (select auth.uid()) and pac.content_key = 'team_goals' and p.status = 'active'
      )
    )
  )
  with check (
    (select auth.uid()) = owner_id and (
      (auth.jwt() ->> 'email') = 'suporte@suzanazatorre.com.br' or exists (
        select 1 from public.profile_plans pp join public.plan_app_contents pac on pac.plan_id = pp.plan_id join public.profiles p on p.id = pp.profile_id
        where pp.profile_id = (select auth.uid()) and pac.content_key = 'team_goals' and p.status = 'active'
      )
    )
  );
