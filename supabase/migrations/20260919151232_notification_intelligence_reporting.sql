alter table public.notification_schedules
  add column if not exists plan_ids uuid[] not null default '{}'::uuid[];

alter table public.notification_schedules
  drop constraint if exists notification_schedules_plan_ids_limit;
alter table public.notification_schedules
  add constraint notification_schedules_plan_ids_limit
  check (cardinality(plan_ids) <= 50);

alter table public.notification_schedule_runs
  add column if not exists audience integer not null default 0,
  add column if not exists in_app_only integer not null default 0;

alter table public.user_notifications
  drop constraint if exists user_notifications_notification_type_check;
alter table public.user_notifications
  add constraint user_notifications_notification_type_check
  check (notification_type in ('motivacional', 'rotina', 'personalizada', 'inteligente'));

alter table public.user_notifications
  add column if not exists rule_id text,
  add column if not exists push_sent_at timestamptz,
  add column if not exists push_device_count integer not null default 0,
  add column if not exists push_failed_count integer not null default 0,
  add column if not exists opened_source text;

alter table public.user_notifications
  drop constraint if exists user_notifications_delivery_counts_check;
alter table public.user_notifications
  add constraint user_notifications_delivery_counts_check
  check (push_device_count >= 0 and push_failed_count >= 0);

alter table public.user_notifications
  drop constraint if exists user_notifications_opened_source_check;
alter table public.user_notifications
  add constraint user_notifications_opened_source_check
  check (opened_source is null or opened_source in ('push', 'in_app'));

create unique index if not exists user_notifications_rule_user_date_uidx
  on public.user_notifications (rule_id, user_id, scheduled_for)
  where rule_id is not null;

create index if not exists user_notifications_schedule_report_idx
  on public.user_notifications (schedule_id, sent_at desc);

create index if not exists user_notifications_rule_report_idx
  on public.user_notifications (rule_id, sent_at desc)
  where rule_id is not null;

create table if not exists public.app_user_activity (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_user_activity_last_seen_idx
  on public.app_user_activity (last_seen_at desc);

alter table public.app_user_activity enable row level security;
revoke all on table public.app_user_activity from anon, authenticated;
grant all on table public.app_user_activity to service_role;

create table if not exists public.notification_smart_rules (
  id text primary key check (id in ('inactive_3_days', 'routine_pending', 'below_goal', 'calendar_today', 'campaign_upcoming')),
  label text not null check (char_length(label) between 1 and 80),
  description text not null check (char_length(description) between 1 and 240),
  send_time time not null check (extract(minute from send_time) in (0, 30) and extract(second from send_time) = 0),
  weekdays smallint[] not null default array[1,2,3,4,5,6]::smallint[]
    check (cardinality(weekdays) between 1 and 7 and weekdays <@ array[0,1,2,3,4,5,6]::smallint[]),
  title_template text not null check (char_length(title_template) between 1 and 80),
  body_template text not null check (char_length(body_template) between 1 and 240),
  target_section text not null check (target_section in ('inicio', 'rotina', 'vendas', 'calendario', 'campanhas')),
  cooldown_days smallint not null default 1 check (cooldown_days between 1 and 90),
  plan_ids uuid[] not null default '{}'::uuid[] check (cardinality(plan_ids) <= 50),
  enabled boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_smart_rule_runs (
  rule_id text not null references public.notification_smart_rules(id) on delete cascade,
  run_date date not null,
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  audience integer not null default 0,
  sent integer not null default 0,
  in_app_only integer not null default 0,
  inactive integer not null default 0,
  failed integer not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (rule_id, run_date)
);

alter table public.notification_smart_rules enable row level security;
alter table public.notification_smart_rule_runs enable row level security;
revoke all on table public.notification_smart_rules from anon, authenticated;
revoke all on table public.notification_smart_rule_runs from anon, authenticated;
grant all on table public.notification_smart_rules to service_role;
grant all on table public.notification_smart_rule_runs to service_role;

insert into public.notification_smart_rules
  (id, label, description, send_time, weekdays, title_template, body_template, target_section, cooldown_days, position)
values
  ('inactive_3_days', 'Lojista afastada do aplicativo', 'Convida quem não abre o aplicativo há pelo menos 3 dias.', '10:00', array[1,3,5]::smallint[], 'Sentimos sua falta, {{nome}} 💛', '{{nome}}, sua loja continua em movimento. Volte ao aplicativo e escolha um próximo passo simples para hoje.', 'inicio', 3, 1),
  ('routine_pending', 'Rotina ainda não iniciada', 'Lembra quem ainda possui ações pendentes na rotina do dia.', '17:30', array[1,2,3,4,5,6]::smallint[], 'Ainda dá tempo de avançar ✨', '{{nome}}, sua próxima ação é {{acao}}. Abra a rotina e conclua um passo antes de encerrar o dia.', 'rotina', 1, 2),
  ('below_goal', 'Ritmo abaixo da meta', 'Avisa quando o resultado do mês está abaixo do ritmo esperado.', '18:00', array[1,2,3,4,5,6]::smallint[], 'Vamos recuperar o ritmo da meta? 🎯', '{{nome}}, seu resultado está abaixo do ritmo planejado. Abra Vendas e Metas e veja o próximo número que precisa buscar.', 'vendas', 3, 3),
  ('calendar_today', 'Ação do calendário para hoje', 'Lembra das ações publicadas no calendário do dia.', '10:30', array[1,2,3,4,5,6]::smallint[], 'Sua ação de conteúdo está pronta 📅', '{{nome}}, hoje temos: {{acao}}. Abra o calendário e execute sem improviso.', 'calendario', 1, 4),
  ('campaign_upcoming', 'Campanha perto de começar', 'Avisa no fim do mês ou nos primeiros dias quando uma campanha está disponível.', '09:30', array[1,2,3,4,5,6]::smallint[], 'A próxima campanha já está no app 🚀', '{{nome}}, a estratégia {{acao}} já está disponível. Abra a campanha e prepare sua loja com antecedência.', 'campanhas', 20, 5)
on conflict (id) do nothing;

comment on table public.notification_smart_rules is
  'Gatilhos automáticos configuráveis para trazer as lojistas de volta ao aplicativo.';
comment on table public.app_user_activity is
  'Última atividade no painel, usada pelos gatilhos e relatórios administrativos.';
