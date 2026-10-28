-- Commercial terms imported from the merchant's Guru catalog. Existing offers
-- retain their original Price calculation and no payment is created here.
alter type public.billing_interval add value if not exists 'day';
alter type public.billing_interval add value if not exists 'week';
alter table public.offers
  alter column monthly_interest_pct type numeric(9,4),
  add column interest_model text not null default 'price' check (interest_model in ('price','simple')),
  add column default_installments integer not null default 1 check (default_installments between 1 and 18),
  add column billing_cycles integer not null default 0 check (billing_cycles between 0 and 999),
  add column guru_offer_id uuid unique,
  add column guru_config jsonb not null default '{}'::jsonb check (jsonb_typeof(guru_config)='object');
alter table public.offers drop constraint offers_max_installments_check;
alter table public.offers add constraint offers_max_installments_check check (max_installments between 1 and 18);

-- Keep the old four-argument calculation for existing callers.
create function public.calc_installment_total(p_price_cents integer, p_installments integer, p_free integer, p_monthly_pct numeric, p_model text)
returns integer language sql immutable security invoker set search_path = '' as $$
  select case when p_installments <= p_free or p_monthly_pct = 0 then p_price_cents
    when p_model = 'simple' then round(p_price_cents * (1 + p_monthly_pct / 100 * p_installments))::integer
    else public.calc_installment_total(p_price_cents,p_installments,p_free,p_monthly_pct) end;
$$;
revoke all on function public.calc_installment_total(integer,integer,integer,numeric,text) from public,anon,authenticated;
grant execute on function public.calc_installment_total(integer,integer,integer,numeric,text) to service_role;

create or replace function public.checkout_duplicate_offer(source_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare copied_id uuid := gen_random_uuid();
begin
  perform set_config('checkout.audit_actor','suporte@suzanazatorre.com.br',true);
  insert into public.offers(id,product_id,slug,name,price_cents,payment_methods,max_installments,free_installments,monthly_interest_pct,pix_discount_pct,billing_interval,billing_interval_count,trial_days,thank_you_url,checkout_config,active,interest_model,default_installments,billing_cycles,guru_config)
    select copied_id,product_id,left(slug,45)||'-'||left(copied_id::text,8),name||' — Cópia',price_cents,payment_methods,max_installments,free_installments,monthly_interest_pct,pix_discount_pct,billing_interval,billing_interval_count,trial_days,thank_you_url,checkout_config,false,interest_model,default_installments,billing_cycles,guru_config
    from public.offers where id=source_id;
  if not found then raise exception 'Oferta não encontrada'; end if;
  insert into public.order_bumps(offer_id,bump_offer_id,headline,description,position,active)
    select copied_id,bump_offer_id,headline,description,position,active from public.order_bumps where offer_id=source_id;
  return copied_id;
end;
$$;
revoke all on function public.checkout_duplicate_offer(uuid) from public,anon,authenticated;
grant execute on function public.checkout_duplicate_offer(uuid) to service_role;
