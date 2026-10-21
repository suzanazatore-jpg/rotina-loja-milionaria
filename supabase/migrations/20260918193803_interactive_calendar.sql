create table if not exists public.calendar_actions (
  id bigint generated always as identity primary key,
  action_date date not null,
  title text not null check (char_length(btrim(title)) between 2 and 160),
  description text check (description is null or char_length(description) <= 1000),
  channel text check (channel is null or char_length(channel) <= 120),
  content_format text check (content_format is null or char_length(content_format) <= 120),
  product_cta text check (product_cta is null or char_length(product_cta) <= 500),
  content_text text check (content_text is null or char_length(content_text) <= 5000),
  material_url text check (material_url is null or char_length(material_url) <= 2000),
  sort_order integer not null default 0 check (sort_order >= 0),
  is_published boolean not null default true,
  batch_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists calendar_actions_date_published_idx
  on public.calendar_actions (action_date, is_published, sort_order);

alter table public.calendar_actions enable row level security;

revoke all on table public.calendar_actions from anon, authenticated;
grant select on table public.calendar_actions to authenticated;
grant usage, select on sequence public.calendar_actions_id_seq to service_role;

drop policy if exists calendar_actions_authenticated_select on public.calendar_actions;
create policy calendar_actions_authenticated_select
  on public.calendar_actions
  for select
  to authenticated
  using (is_published = true);

create table if not exists public.calendar_action_progress (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  action_id bigint not null references public.calendar_actions(id) on delete cascade,
  status text not null default 'concluido' check (status in ('iniciado', 'concluido')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, action_id)
);

create index if not exists calendar_action_progress_owner_idx
  on public.calendar_action_progress (owner_id, updated_at desc);

alter table public.calendar_action_progress enable row level security;

revoke all on table public.calendar_action_progress from anon, authenticated;
grant select, insert, update, delete on table public.calendar_action_progress to authenticated;

drop policy if exists calendar_action_progress_owner_select on public.calendar_action_progress;
create policy calendar_action_progress_owner_select
  on public.calendar_action_progress
  for select
  to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists calendar_action_progress_owner_insert on public.calendar_action_progress;
create policy calendar_action_progress_owner_insert
  on public.calendar_action_progress
  for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

drop policy if exists calendar_action_progress_owner_update on public.calendar_action_progress;
create policy calendar_action_progress_owner_update
  on public.calendar_action_progress
  for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists calendar_action_progress_owner_delete on public.calendar_action_progress;
create policy calendar_action_progress_owner_delete
  on public.calendar_action_progress
  for delete
  to authenticated
  using ((select auth.uid()) = owner_id);
