alter table public.courses
  add column if not exists protocol_enabled boolean not null default false,
  add column if not exists protocol_offer_url text;

alter table public.lessons
  add column if not exists protocol_checklist jsonb not null default '[]'::jsonb,
  add column if not exists protocol_notification text;

alter table public.lessons
  add constraint lessons_protocol_checklist_array_check
  check (jsonb_typeof(protocol_checklist) = 'array');

create table public.protocol_runs (
  owner_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  lot_name text not null check (char_length(lot_name) between 1 and 120),
  starting_pieces integer not null check (starting_pieces between 1 and 100000),
  goal_cents bigint not null check (goal_cents between 100 and 100000000000),
  monthly_revenue_band text check (monthly_revenue_band in ('ate_20','20_50','50_100','100_500','500_mais')),
  team_size integer check (team_size between 0 and 100),
  started_on date not null default (now() at time zone 'America/Sao_Paulo')::date,
  created_at timestamptz not null default now(),
  primary key (owner_id, course_id)
);

create table public.protocol_entries (
  owner_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  checklist jsonb not null default '[]'::jsonb check (jsonb_typeof(checklist) = 'array'),
  pieces_posted integer check (pieces_posted between 0 and 100000),
  invited_count integer check (invited_count between 0 and 100000),
  conversations_count integer check (conversations_count between 0 and 100000),
  note text not null default '' check (char_length(note) <= 2000),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (owner_id, lesson_id),
  foreign key (owner_id, course_id) references public.protocol_runs(owner_id, course_id) on delete cascade
);

create table public.protocol_sales (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  course_id uuid not null,
  amount_cents bigint not null check (amount_cents between 1 and 1000000000),
  pieces integer not null check (pieces between 1 and 100000),
  created_at timestamptz not null default now(),
  foreign key (owner_id, course_id) references public.protocol_runs(owner_id, course_id) on delete cascade
);

create index protocol_sales_owner_course_idx on public.protocol_sales(owner_id, course_id, created_at desc);
create index protocol_sales_course_idx on public.protocol_sales(course_id);
create index protocol_entries_course_lesson_idx on public.protocol_entries(course_id, lesson_id);
create index protocol_entries_lesson_idx on public.protocol_entries(lesson_id);
create index protocol_runs_course_started_idx on public.protocol_runs(course_id, started_on);

create table public.protocol_notification_deliveries (
  owner_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, lesson_id, subscription_id)
);
create index protocol_notification_course_idx on public.protocol_notification_deliveries(course_id);
create index protocol_notification_lesson_idx on public.protocol_notification_deliveries(lesson_id);
create index protocol_notification_subscription_idx on public.protocol_notification_deliveries(subscription_id);

-- Dados das campanhas passam pela API autenticada, que verifica a matrícula ativa.
-- O cliente público não recebe permissão direta para estas tabelas.
alter table public.protocol_runs enable row level security;
alter table public.protocol_entries enable row level security;
alter table public.protocol_sales enable row level security;
alter table public.protocol_notification_deliveries enable row level security;
revoke all on public.protocol_runs, public.protocol_entries, public.protocol_sales, public.protocol_notification_deliveries from public;
revoke all on public.protocol_runs, public.protocol_entries, public.protocol_sales, public.protocol_notification_deliveries from anon, authenticated;
grant all on public.protocol_runs, public.protocol_entries, public.protocol_sales, public.protocol_notification_deliveries to service_role;
