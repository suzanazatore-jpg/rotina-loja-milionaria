-- Identidade visual global. Não modifica preços, planos ou acessos existentes.
alter table public.checkout_settings add column if not exists checkout_config jsonb not null default '{}'::jsonb check (jsonb_typeof(checkout_config) = 'object');

-- Auditoria transacional: valores privados, URLs e configurações completas não são copiados.
create or replace function public.checkout_catalog_audit()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  before_row jsonb := '{}'::jsonb;
  after_row jsonb := to_jsonb(new);
  changed jsonb;
  actor text;
begin
  if tg_op = 'UPDATE' then before_row := to_jsonb(old); end if;
  select jsonb_agg(key order by key) into changed from jsonb_each(after_row)
    where before_row -> key is distinct from value;
  if changed is null then return new; end if;
  actor := coalesce(nullif(current_setting('checkout.audit_actor', true), ''), current_user);
  insert into public.webhook_events(pagarme_event_id,type,payload,processed_at)
  values ('catalog-admin:' || gen_random_uuid(), 'checkout.catalog.admin',
    jsonb_build_object('action',lower(tg_op),'entity',case when tg_table_name='products' then 'produto' else 'oferta' end,
      'target_id',new.id,'product_id',case when tg_table_name='products' then new.id else (after_row->>'product_id')::uuid end,
      'name',new.name,'actor',actor,'changed_fields',changed,'active',new.active), now());
  return new;
end;
$$;
revoke all on function public.checkout_catalog_audit() from public, anon, authenticated;
grant execute on function public.checkout_catalog_audit() to service_role;
create trigger checkout_product_audit after insert or update on public.products for each row execute function public.checkout_catalog_audit();
create trigger checkout_offer_audit after insert or update on public.offers for each row execute function public.checkout_catalog_audit();

-- Duplicação atômica: a cópia nasce inativa e nunca reutiliza o link original.
create or replace function public.checkout_duplicate_offer(source_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare copied_id uuid := gen_random_uuid();
begin
  perform set_config('checkout.audit_actor','suporte@suzanazatorre.com.br',true);
  insert into public.offers(id,product_id,slug,name,price_cents,payment_methods,max_installments,free_installments,monthly_interest_pct,pix_discount_pct,billing_interval,billing_interval_count,trial_days,thank_you_url,checkout_config,active)
    select copied_id,product_id,left(slug,45)||'-'||left(copied_id::text,8),name||' — Cópia',price_cents,payment_methods,max_installments,free_installments,monthly_interest_pct,pix_discount_pct,billing_interval,billing_interval_count,trial_days,thank_you_url,checkout_config,false
    from public.offers where id=source_id;
  if not found then raise exception 'Oferta não encontrada'; end if;
  insert into public.order_bumps(offer_id,bump_offer_id,headline,description,position,active)
    select copied_id,bump_offer_id,headline,description,position,active from public.order_bumps where offer_id=source_id;
  return copied_id;
end;
$$;
revoke all on function public.checkout_duplicate_offer(uuid) from public, anon, authenticated;
grant execute on function public.checkout_duplicate_offer(uuid) to service_role;
