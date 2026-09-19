alter table public.plan_app_contents
  drop constraint if exists plan_app_contents_content_key_check;

alter table public.plan_app_contents
  add constraint plan_app_contents_content_key_check
  check (content_key in ('calendar', 'campaigns', 'routine', 'team_goals', 'mentorship', 'assistant', 'pricing'));

create table if not exists public.pricing_calculations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_name text not null check (char_length(btrim(product_name)) between 1 and 120),
  item_cost numeric(12,2) not null check (item_cost > 0),
  fees numeric(12,2) not null default 0 check (fees >= 0),
  extra_costs numeric(12,2) not null default 0 check (extra_costs >= 0),
  desired_margin numeric(5,2) not null check (desired_margin > 20 and desired_margin <= 90),
  minimum_margin numeric(5,2) not null default 20 check (minimum_margin >= 0 and minimum_margin < desired_margin),
  total_cost numeric(12,2) generated always as (round(item_cost + fees + extra_costs, 2)) stored,
  suggested_price numeric(12,2) generated always as (
    round((item_cost + fees + extra_costs) / (1 - desired_margin / 100), 2)
  ) stored,
  profit numeric(12,2) generated always as (
    round(((item_cost + fees + extra_costs) / (1 - desired_margin / 100)) - (item_cost + fees + extra_costs), 2)
  ) stored,
  markup numeric(10,4) generated always as (
    round(((item_cost + fees + extra_costs) / (1 - desired_margin / 100)) / (item_cost + fees + extra_costs), 4)
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pricing_calculations_owner_created_idx
  on public.pricing_calculations (owner_id, created_at desc);

alter table public.pricing_calculations enable row level security;

revoke all on table public.pricing_calculations from anon;
grant select, insert, update, delete on table public.pricing_calculations to authenticated;
grant all on table public.pricing_calculations to service_role;

drop policy if exists pricing_calculations_owner_select on public.pricing_calculations;
create policy pricing_calculations_owner_select
  on public.pricing_calculations for select
  to authenticated
  using (
    (select auth.uid()) = owner_id
    and (
      (select auth.jwt()) ->> 'email' = 'suporte@suzanazatorre.com.br'
      or exists (
        select 1
        from public.profile_plans pp
        join public.profiles p on p.id = pp.profile_id
        join public.plan_app_contents pac on pac.plan_id = pp.plan_id
        where pp.profile_id = (select auth.uid())
          and p.status = 'active'
          and pac.content_key = 'pricing'
      )
    )
  );

drop policy if exists pricing_calculations_owner_insert on public.pricing_calculations;
create policy pricing_calculations_owner_insert
  on public.pricing_calculations for insert
  to authenticated
  with check (
    (select auth.uid()) = owner_id
    and (
      (select auth.jwt()) ->> 'email' = 'suporte@suzanazatorre.com.br'
      or exists (
        select 1
        from public.profile_plans pp
        join public.profiles p on p.id = pp.profile_id
        join public.plan_app_contents pac on pac.plan_id = pp.plan_id
        where pp.profile_id = (select auth.uid())
          and p.status = 'active'
          and pac.content_key = 'pricing'
      )
    )
  );

drop policy if exists pricing_calculations_owner_update on public.pricing_calculations;
create policy pricing_calculations_owner_update
  on public.pricing_calculations for update
  to authenticated
  using (
    (select auth.uid()) = owner_id
    and (
      (select auth.jwt()) ->> 'email' = 'suporte@suzanazatorre.com.br'
      or exists (
        select 1
        from public.profile_plans pp
        join public.profiles p on p.id = pp.profile_id
        join public.plan_app_contents pac on pac.plan_id = pp.plan_id
        where pp.profile_id = (select auth.uid())
          and p.status = 'active'
          and pac.content_key = 'pricing'
      )
    )
  )
  with check (
    (select auth.uid()) = owner_id
    and (
      (select auth.jwt()) ->> 'email' = 'suporte@suzanazatorre.com.br'
      or exists (
        select 1
        from public.profile_plans pp
        join public.profiles p on p.id = pp.profile_id
        join public.plan_app_contents pac on pac.plan_id = pp.plan_id
        where pp.profile_id = (select auth.uid())
          and p.status = 'active'
          and pac.content_key = 'pricing'
      )
    )
  );

drop policy if exists pricing_calculations_owner_delete on public.pricing_calculations;
create policy pricing_calculations_owner_delete
  on public.pricing_calculations for delete
  to authenticated
  using (
    (select auth.uid()) = owner_id
    and (
      (select auth.jwt()) ->> 'email' = 'suporte@suzanazatorre.com.br'
      or exists (
        select 1
        from public.profile_plans pp
        join public.profiles p on p.id = pp.profile_id
        join public.plan_app_contents pac on pac.plan_id = pp.plan_id
        where pp.profile_id = (select auth.uid())
          and p.status = 'active'
          and pac.content_key = 'pricing'
      )
    )
  );

comment on table public.pricing_calculations is
  'Cálculos de preço, margem e lucro salvos individualmente por cada lojista.';
