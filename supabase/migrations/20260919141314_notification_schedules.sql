create table if not exists public.notification_schedules (
  id uuid primary key default gen_random_uuid(),
  label text not null check (char_length(trim(label)) between 1 and 80),
  notification_type text not null check (notification_type in ('motivacional', 'rotina', 'personalizada')),
  send_time time without time zone not null,
  weekdays smallint[] not null default array[0, 1, 2, 3, 4, 5, 6]::smallint[],
  title_template text,
  body_template text,
  enabled boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_schedules_weekdays_check check (
    cardinality(weekdays) between 1 and 7
    and weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
  ),
  constraint notification_schedules_custom_content_check check (
    notification_type <> 'personalizada'
    or (
      char_length(trim(coalesce(title_template, ''))) between 1 and 80
      and char_length(trim(coalesce(body_template, ''))) between 1 and 240
    )
  )
);

create index if not exists notification_schedules_due_idx
  on public.notification_schedules (enabled, send_time, position);

alter table public.notification_schedules enable row level security;
revoke all on table public.notification_schedules from anon, authenticated;
grant all on table public.notification_schedules to service_role;

create table if not exists public.notification_schedule_runs (
  schedule_id uuid not null references public.notification_schedules(id) on delete cascade,
  run_date date not null,
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  sent integer not null default 0,
  inactive integer not null default 0,
  failed integer not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (schedule_id, run_date)
);

alter table public.notification_schedule_runs enable row level security;
revoke all on table public.notification_schedule_runs from anon, authenticated;
grant all on table public.notification_schedule_runs to service_role;

insert into public.notification_schedules (label, notification_type, send_time, weekdays, enabled, position)
select 'Mensagem motivacional', 'motivacional', '08:00', array[0, 1, 2, 3, 4, 5, 6]::smallint[], true, 1
where not exists (
  select 1 from public.notification_schedules where notification_type = 'motivacional'
);

insert into public.notification_schedules (label, notification_type, send_time, weekdays, enabled, position)
select 'Lembrete da rotina', 'rotina', '09:00', array[0, 1, 2, 3, 4, 5, 6]::smallint[], true, 2
where not exists (
  select 1 from public.notification_schedules where notification_type = 'rotina'
);
