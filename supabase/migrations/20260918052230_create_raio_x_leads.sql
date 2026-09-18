create table if not exists public.raio_x_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nome text not null check (char_length(nome) between 2 and 100),
  email text not null check (char_length(email) between 5 and 180),
  whatsapp text not null check (char_length(whatsapp) between 10 and 20),
  faturamento_faixa text not null,
  numero_vendedoras text not null,
  acompanhamento_meta text not null,
  estoque_parado text not null,
  autonomia_equipe text not null,
  rotina_whatsapp text not null,
  frequencia_campanhas text not null,
  maior_dificuldade text not null,
  pontuacoes jsonb not null check (jsonb_typeof(pontuacoes) = 'object'),
  gargalo text not null,
  perda_estimada numeric(12,2) not null default 0,
  consentimento boolean not null check (consentimento = true),
  origem text not null default 'raio-x-loja-lucrativa',
  utm jsonb not null default '{}'::jsonb check (jsonb_typeof(utm) = 'object')
);

create index if not exists raio_x_leads_created_at_idx
  on public.raio_x_leads(created_at desc);

create index if not exists raio_x_leads_whatsapp_idx
  on public.raio_x_leads(whatsapp);

alter table public.raio_x_leads enable row level security;

revoke all on public.raio_x_leads from anon, authenticated;
grant all on public.raio_x_leads to service_role;

drop policy if exists "raio_x_leads_block_client_access" on public.raio_x_leads;
create policy "raio_x_leads_block_client_access"
  on public.raio_x_leads for all
  to anon, authenticated
  using (false)
  with check (false);

comment on table public.raio_x_leads is
  'Leads captados pela landing app pública Raio-X da Loja Lucrativa. Acesso somente pelo backend com service_role.';
