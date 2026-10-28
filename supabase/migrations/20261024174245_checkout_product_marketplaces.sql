create table public.checkout_marketplaces (
 id text primary key check (id ~ '^[a-z][a-z0-9_-]{1,39}$'),
 name text not null check (length(name) between 1 and 80),
 active boolean not null default true
);
alter table public.checkout_marketplaces enable row level security;
revoke all on public.checkout_marketplaces from public,anon,authenticated;
grant select on public.checkout_marketplaces to service_role;
insert into public.checkout_marketplaces(id,name) values('pagarme','Pagar.me');
alter table public.products add column marketplace_id text not null default 'pagarme' references public.checkout_marketplaces(id);
create index products_marketplace_idx on public.products(marketplace_id);

-- Cópia somente do cadastro; código e slug novos, sem ofertas ativas.
create or replace function public.checkout_duplicate_product(source_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare copied_id uuid := gen_random_uuid();
begin
 perform set_config('checkout.audit_actor','suporte@suzanazatorre.com.br',true);
 insert into public.products(id,name,slug,type,plan_id,access_days,brevo_list_id,botconversa_tag,marketplace_id,active)
 select copied_id,name||' — Cópia',left(slug,45)||'-'||left(copied_id::text,8),type,plan_id,access_days,brevo_list_id,botconversa_tag,marketplace_id,false
 from public.products where id=source_id;
 if not found then raise exception 'Produto não encontrado'; end if;
 return copied_id;
end;
$$;
revoke all on function public.checkout_duplicate_product(uuid) from public,anon,authenticated;
grant execute on function public.checkout_duplicate_product(uuid) to service_role;
