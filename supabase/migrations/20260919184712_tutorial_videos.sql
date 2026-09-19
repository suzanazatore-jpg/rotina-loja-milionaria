create table if not exists public.tutorial_videos (
  module_key text primary key,
  title text not null,
  video_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tutorial_videos_module_key_check check (
    module_key in ('routine', 'campaigns', 'calendar', 'team_goals', 'pricing')
  ),
  constraint tutorial_videos_title_length check (char_length(title) between 1 and 120),
  constraint tutorial_videos_url_length check (video_url is null or char_length(video_url) <= 1000)
);

alter table public.tutorial_videos enable row level security;

revoke all on table public.tutorial_videos from anon, authenticated;
grant all on table public.tutorial_videos to service_role;

insert into public.tutorial_videos (module_key, title)
values
  ('routine', 'Como executar a rotina da loja'),
  ('campaigns', 'Como usar a campanha do mês'),
  ('calendar', 'Como usar o calendário de postagens'),
  ('team_goals', 'Como usar a calculadora de metas'),
  ('pricing', 'Como usar a calculadora de precificação')
on conflict (module_key) do nothing;
