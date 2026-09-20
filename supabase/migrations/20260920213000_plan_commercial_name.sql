alter table public.plans
  add column if not exists commercial_name text;

comment on column public.plans.name is
  'Nome interno usado no administrativo para organizar planos e ofertas.';

comment on column public.plans.commercial_name is
  'Nome comercial exibido para a aluna no aplicativo e usado pela Assistente.';
