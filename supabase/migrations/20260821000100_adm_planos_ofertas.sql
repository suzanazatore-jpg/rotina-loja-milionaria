-- Estrutura administrativa adaptada da Academia de Vendas.
-- Esta migração cria somente tabelas vazias no projeto do app.
-- Nenhum registro do Supabase da Academia é copiado.

create extension if not exists pgcrypto;

create table if not exists public.planos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  oferta_id text,
  periodo_dias integer check (periodo_dias is null or periodo_dias > 0),
  preco numeric(12, 2) check (preco is null or preco >= 0),
  url_venda text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create unique index if not exists planos_oferta_id_unico
  on public.planos (oferta_id)
  where oferta_id is not null and oferta_id <> '';

create table if not exists public.plano_cursos (
  id uuid primary key default gen_random_uuid(),
  plano_id uuid not null references public.planos(id) on delete cascade,
  curso_id uuid not null references public.courses(id) on delete cascade,
  criado_em timestamptz not null default now(),
  unique (plano_id, curso_id)
);

alter table public.planos enable row level security;
alter table public.plano_cursos enable row level security;

drop policy if exists "admin gerencia planos" on public.planos;
create policy "admin gerencia planos"
  on public.planos for all
  to authenticated
  using ((auth.jwt() ->> 'email') = 'suporte@suzanazatorre.com.br')
  with check ((auth.jwt() ->> 'email') = 'suporte@suzanazatorre.com.br');

drop policy if exists "admin gerencia cursos dos planos" on public.plano_cursos;
create policy "admin gerencia cursos dos planos"
  on public.plano_cursos for all
  to authenticated
  using ((auth.jwt() ->> 'email') = 'suporte@suzanazatorre.com.br')
  with check ((auth.jwt() ->> 'email') = 'suporte@suzanazatorre.com.br');

comment on table public.planos is
  'Planos e ofertas do app Rotina da Loja Milionária; estrutura vazia, sem dados da Academia.';
comment on table public.plano_cursos is
  'Vínculo entre planos do app e cursos existentes no próprio app.';
