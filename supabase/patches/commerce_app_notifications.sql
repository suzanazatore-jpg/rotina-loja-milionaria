-- Aplicar antes da versão que usa estas tabelas. Não dispara mensagens retroativas.
alter table public.user_notifications add column if not exists commerce_key text;
create unique index if not exists user_notifications_commerce_unique on public.user_notifications(user_id, commerce_key);

create table if not exists public.app_installations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  confirmed_at timestamptz not null default now(),
  evidence text not null check (evidence in ('standalone','appinstalled'))
);
alter table public.app_installations enable row level security;
revoke all on public.app_installations from anon, authenticated;
grant all on public.app_installations to service_role;

create table if not exists public.commerce_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.user_notifications(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','sending','sent','expired')),
  attempts integer not null default 0,
  locked_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  unique(notification_id,subscription_id)
);
alter table public.commerce_push_deliveries enable row level security;
revoke all on public.commerce_push_deliveries from anon, authenticated;
grant all on public.commerce_push_deliveries to service_role;
create index if not exists commerce_push_pending on public.commerce_push_deliveries(status,next_attempt_at);

create table if not exists public.commerce_notification_config (
  id boolean primary key default true check(id),
  activated_at timestamptz not null default now()
);
alter table public.commerce_notification_config enable row level security;
revoke all on public.commerce_notification_config from anon, authenticated;
grant all on public.commerce_notification_config to service_role;
insert into public.commerce_notification_config(id) values(true) on conflict do nothing;

create table if not exists public.app_install_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sent_by uuid not null references auth.users(id),
  status text not null check(status in ('sending','accepted','failed','unknown')),
  created_at timestamptz not null default now(),
  provider_id text
);
alter table public.app_install_reminders enable row level security;
revoke all on public.app_install_reminders from anon, authenticated;
grant all on public.app_install_reminders to service_role;
create unique index if not exists app_install_reminder_busy on public.app_install_reminders(user_id) where status='sending';
