alter table public.products add column image_url text;
alter table public.products add column updated_at timestamptz;
create or replace function public.checkout_duplicate_product(source_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare copied_id uuid := gen_random_uuid();
begin
 perform set_config('checkout.audit_actor','suporte@suzanazatorre.com.br',true);
 insert into public.products(id,name,slug,type,plan_id,access_days,brevo_list_id,botconversa_tag,marketplace_id,image_url,active)
 select copied_id,name||' — Cópia',left(slug,45)||'-'||left(copied_id::text,8),type,plan_id,access_days,brevo_list_id,botconversa_tag,marketplace_id,image_url,false
 from public.products where id=source_id;
 if not found then raise exception 'Produto não encontrado'; end if;
 return copied_id;
end;
$$;
revoke all on function public.checkout_duplicate_product(uuid) from public,anon,authenticated;
grant execute on function public.checkout_duplicate_product(uuid) to service_role;
