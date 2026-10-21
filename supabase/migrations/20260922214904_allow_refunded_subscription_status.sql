alter table public.perfis
  drop constraint if exists perfis_status_assinatura_check;

alter table public.perfis
  add constraint perfis_status_assinatura_check
  check (status_assinatura = any (array[
    'ativo'::text,
    'atrasado'::text,
    'cancelado'::text,
    'reembolsado'::text
  ]));
