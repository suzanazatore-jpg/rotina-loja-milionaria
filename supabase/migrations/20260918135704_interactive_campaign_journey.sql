alter table public.campanhas
  add column if not exists plano_interativo jsonb not null default '{}'::jsonb;

alter table public.campanhas
  drop constraint if exists campanhas_plano_interativo_object_check;

alter table public.campanhas
  add constraint campanhas_plano_interativo_object_check
  check (jsonb_typeof(plano_interativo) = 'object');

create table if not exists public.campaign_task_progress (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  campaign_id bigint not null references public.campanhas(id) on delete cascade,
  task_id text not null check (char_length(task_id) between 1 and 80),
  completed_at timestamptz not null default now(),
  constraint campaign_task_progress_owner_campaign_task_unique
    unique (owner_id, campaign_id, task_id)
);

create index if not exists campaign_task_progress_owner_campaign_idx
  on public.campaign_task_progress(owner_id, campaign_id);

alter table public.campaign_task_progress enable row level security;

revoke all on public.campaign_task_progress from anon;
revoke all on public.campaign_task_progress from authenticated;
grant select, insert, delete on public.campaign_task_progress to authenticated;
grant all on public.campaign_task_progress to service_role;

drop policy if exists "campaign_task_progress_owner_select" on public.campaign_task_progress;
create policy "campaign_task_progress_owner_select"
  on public.campaign_task_progress for select
  to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "campaign_task_progress_owner_insert" on public.campaign_task_progress;
create policy "campaign_task_progress_owner_insert"
  on public.campaign_task_progress for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

drop policy if exists "campaign_task_progress_owner_delete" on public.campaign_task_progress;
create policy "campaign_task_progress_owner_delete"
  on public.campaign_task_progress for delete
  to authenticated
  using ((select auth.uid()) = owner_id);

create index if not exists campaign_task_progress_campaign_idx
  on public.campaign_task_progress(campaign_id);
