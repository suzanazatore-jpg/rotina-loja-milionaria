alter table public.products
  add column catalog_hidden boolean not null default false,
  add column tracking_eligible boolean not null default false;

create or replace function public.checkout_duplicate_product(source_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare copied_id uuid := gen_random_uuid();
begin
  perform set_config('checkout.audit_actor','suporte@suzanazatorre.com.br',true);
  insert into public.products (
    id, name, slug, type, plan_id, access_days, brevo_list_id, botconversa_tag,
    marketplace_id, image_url, active, catalog_hidden, tracking_eligible
  )
  select copied_id, name || ' — Cópia', left(slug,45) || '-' || left(copied_id::text,8),
    type, plan_id, access_days, brevo_list_id, botconversa_tag,
    marketplace_id, image_url, false, catalog_hidden, tracking_eligible
  from public.products where id = source_id;
  if not found then raise exception 'Produto não encontrado'; end if;
  return copied_id;
end;
$$;
