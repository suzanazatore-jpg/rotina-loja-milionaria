-- Cadastro global do checkout próprio. Nenhuma tabela existente é recriada.
create table if not exists public.checkout_settings (
  id text primary key default 'global' check (id = 'global'),
  gtm_id text not null default '' check (gtm_id = '' or gtm_id ~ '^GTM-[A-Z0-9]{4,20}$'),
  meta_pixel_id text not null default '' check (meta_pixel_id = '' or meta_pixel_id ~ '^[0-9]{5,30}$'),
  updated_at timestamptz not null default now()
);
alter table public.checkout_settings enable row level security;
revoke all on table public.checkout_settings from public, anon, authenticated;
grant select, insert, update on table public.checkout_settings to service_role;
insert into public.checkout_settings (id) values ('global') on conflict (id) do nothing;
