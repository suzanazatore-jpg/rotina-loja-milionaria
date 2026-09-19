create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  schedule_id uuid references public.notification_schedules(id) on delete set null,
  notification_type text not null check (notification_type in ('motivacional', 'rotina', 'personalizada')),
  title text not null check (char_length(title) between 1 and 80),
  body text not null check (char_length(body) between 1 and 240),
  target_url text not null default '/painel'
    check (target_url = '/painel' or target_url like '/painel?%' or target_url like '/painel/%'),
  scheduled_for date not null,
  sent_at timestamptz not null default now(),
  read_at timestamptz,
  opened_at timestamptz,
  created_at timestamptz not null default now(),
  unique (schedule_id, user_id, scheduled_for)
);

create index if not exists user_notifications_user_sent_idx
  on public.user_notifications (user_id, sent_at desc);

create index if not exists user_notifications_user_unread_idx
  on public.user_notifications (user_id, sent_at desc)
  where read_at is null;

alter table public.user_notifications enable row level security;

revoke all on table public.user_notifications from anon, authenticated;
grant all on table public.user_notifications to service_role;

comment on table public.user_notifications is
  'Histórico individual das notificações exibidas no sininho do aplicativo.';
