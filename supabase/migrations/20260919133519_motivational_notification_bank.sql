create table if not exists public.notification_messages (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'motivacional' check (type = 'motivacional'),
  body_template text not null check (char_length(body_template) between 1 and 240),
  position integer not null check (position > 0),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notification_messages_rotation_idx
  on public.notification_messages(type, enabled, position, id);

alter table public.notification_messages enable row level security;

revoke all on table public.notification_messages from anon, authenticated;
grant select, insert, update, delete on table public.notification_messages to service_role;

insert into public.notification_messages (type, body_template, position, enabled)
select 'motivacional', settings.body_template, 1, true
from public.notification_settings settings
where settings.id = 'motivacional'
  and not exists (
    select 1
    from public.notification_messages messages
    where messages.type = 'motivacional'
  );

update public.notification_settings
set
  body_template = '{{nome}}, sua primeira ação de hoje é: {{acao}}. Abra o app e avance um passo de cada vez.',
  updated_at = now()
where id = 'rotina'
  and body_template = '{{nome}}, sua primeira ação já está te esperando. Abra o app e avance um passo de cada vez.';
