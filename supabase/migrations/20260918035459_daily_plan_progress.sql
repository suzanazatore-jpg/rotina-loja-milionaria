alter table public.rotinas
  add column if not exists plano_dias jsonb not null default '{}'::jsonb;

alter table public.rotinas
  drop constraint if exists rotinas_plano_dias_object_check;

alter table public.rotinas
  add constraint rotinas_plano_dias_object_check
  check (jsonb_typeof(plano_dias) = 'object');

create table if not exists public.daily_task_progress (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  task_date date not null,
  task_id text not null check (char_length(task_id) between 1 and 80),
  completed_at timestamptz not null default now(),
  constraint daily_task_progress_owner_date_task_unique
    unique (owner_id, task_date, task_id)
);

create index if not exists daily_task_progress_owner_date_idx
  on public.daily_task_progress(owner_id, task_date desc);

alter table public.daily_task_progress enable row level security;

revoke all on public.daily_task_progress from anon;
grant select, insert, delete on public.daily_task_progress to authenticated;
grant all on public.daily_task_progress to service_role;

drop policy if exists "daily_task_progress_owner_select" on public.daily_task_progress;
create policy "daily_task_progress_owner_select"
  on public.daily_task_progress for select
  to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "daily_task_progress_owner_insert" on public.daily_task_progress;
create policy "daily_task_progress_owner_insert"
  on public.daily_task_progress for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

drop policy if exists "daily_task_progress_owner_delete" on public.daily_task_progress;
create policy "daily_task_progress_owner_delete"
  on public.daily_task_progress for delete
  to authenticated
  using ((select auth.uid()) = owner_id);
