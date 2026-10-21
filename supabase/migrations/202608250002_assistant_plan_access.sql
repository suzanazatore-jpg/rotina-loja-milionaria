-- Controla a liberação do Assistente Virtual por plano e por aluna.
alter table public.profiles
  add column if not exists assistant_enabled boolean not null default false;

alter table public.plan_app_contents
  drop constraint if exists plan_app_contents_content_key_check;

alter table public.plan_app_contents
  add constraint plan_app_contents_content_key_check
  check (content_key in ('calendar', 'campaigns', 'routine', 'team_goals', 'mentorship', 'assistant'));

grant select, insert, update, delete on public.plan_app_contents to authenticated;
grant select, insert, update, delete on public.plan_app_contents to service_role;

-- Mantém o plano efetivamente escolhido para cada aluna. Assim, uma alteração
-- no plano passa a valer em todos os dispositivos sem duplicar permissões.
create table if not exists public.profile_plans (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  plan_id uuid not null references public.plans(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, plan_id)
);

alter table public.profile_plans enable row level security;

grant select on public.profile_plans to authenticated;
grant select, insert, update, delete on public.profile_plans to service_role;

create policy "Alunas visualizam apenas os próprios planos"
  on public.profile_plans for select
  to authenticated
  using ((select auth.uid()) = profile_id);
