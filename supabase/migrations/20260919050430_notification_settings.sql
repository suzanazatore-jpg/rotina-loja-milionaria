create table if not exists public.notification_settings (
  id text primary key check (id in ('motivacional', 'rotina')),
  enabled boolean not null default true,
  title_template text not null check (char_length(title_template) between 1 and 80),
  body_template text not null check (char_length(body_template) between 1 and 240),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notification_settings enable row level security;

revoke all on table public.notification_settings from anon, authenticated;
grant select, insert, update, delete on table public.notification_settings to service_role;

insert into public.notification_settings (id, enabled, title_template, body_template)
values
  (
    'motivacional',
    true,
    'Bom dia, {{nome}}! 💛',
    'Respire, organize o foco e comece com confiança. Hoje é mais uma oportunidade de movimentar sua loja. Toque para entrar no app.'
  ),
  (
    'rotina',
    true,
    'Vamos começar a rotina de hoje? ✨',
    '{{nome}}, sua primeira ação já está te esperando. Abra o app e avance um passo de cada vez.'
  )
on conflict (id) do nothing;
