create table if not exists public.sales_simulator_settings (
  id text primary key check (id = 'pagarme'),
  rates jsonb not null check (jsonb_typeof(rates) = 'object')
);

alter table public.sales_simulator_settings enable row level security;
revoke all on table public.sales_simulator_settings from public, anon, authenticated;
grant select on table public.sales_simulator_settings to service_role;
