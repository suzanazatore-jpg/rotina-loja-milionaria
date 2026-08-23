create table if not exists public.plan_app_contents (
  plan_id uuid not null references public.plans(id) on delete cascade,
  content_key text not null check (content_key in ('calendar', 'campaigns', 'routine', 'team_goals')),
  created_at timestamptz not null default now(),
  primary key (plan_id, content_key)
);

alter table public.plan_app_contents enable row level security;

create policy "Authenticated users can read plan app contents"
  on public.plan_app_contents for select
  to authenticated
  using (true);

create policy "Authenticated admin can manage plan app contents"
  on public.plan_app_contents for all
  to authenticated
  using ((auth.jwt() ->> 'email') = 'suporte@suzanazatorre.com.br')
  with check ((auth.jwt() ->> 'email') = 'suporte@suzanazatorre.com.br');
