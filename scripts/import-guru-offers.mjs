// Produces reviewable SQL; does not connect to any database or payment provider.
// Run: node scripts/import-guru-offers.mjs > /tmp/guru-offers.sql
import { readFileSync } from 'node:fs'
const offers=JSON.parse(readFileSync(new URL('../docs/guru-offers-2026-10-24.json',import.meta.url),'utf8'))
if(offers.length!==85||new Set(offers.map(o=>o.source_offer_id)).size!==85)throw Error('Invalid source manifest')
console.log(`begin;
select set_config('checkout.audit_actor','suporte@suzanazatorre.com.br — importação Guru 24/10/2026',true);
create temp table guru_offer_import on commit drop as
select value as source from jsonb_array_elements($guru$${JSON.stringify(offers)}$guru$::jsonb);
do $$ begin
  if (select count(*) from guru_offer_import) <> 85 then raise exception 'Catálogo incompleto'; end if;
  if exists(select 1 from guru_offer_import i left join public.products p on p.code=(i.source->>'product_code')::bigint
    where p.id is null or (p.type='subscription') is distinct from (i.source->>'subscription')::boolean)
    then raise exception 'Código ou tipo de produto divergente'; end if;
  if (select count(*) from public.offers where guru_offer_id is null) > 1
    then raise exception 'Novas ofertas locais: revisar deduplicação antes de importar'; end if;
end $$;
-- Preserve the existing Protocolo ID, existing checkout URL and visual settings.
update public.offers o set guru_offer_id=(i.source->>'source_offer_id')::uuid
from guru_offer_import i, public.products p
where p.id=o.product_id and p.code=1790286704 and (i.source->>'product_code')::bigint=p.code
and o.guru_offer_id is null and o.slug='protocolo-zerando-estoque-47' and o.price_cents=4700;
insert into public.offers(product_id,name,slug,price_cents,payment_methods,max_installments,free_installments,monthly_interest_pct,interest_model,default_installments,billing_interval,billing_interval_count,billing_cycles,active,guru_offer_id,guru_config,checkout_config)
select p.id, i.source->>'name', i.source->>'source_slug', (i.source->>'price_cents')::integer,
  array(select m::public.payment_method from jsonb_array_elements_text(i.source->'payment_methods') m where m in ('pix','credit_card') and (p.type<>'subscription' or m='credit_card')),
  (i.source->>'max_installments')::integer,(i.source->>'free_installments')::integer,(i.source->>'monthly_interest_pct')::numeric,
  'simple',(i.source->>'default_installments')::integer,(i.source->>'billing_interval')::public.billing_interval,
  (i.source->>'billing_interval_count')::integer,(i.source->>'billing_cycles')::integer,false,(i.source->>'source_offer_id')::uuid,
  i.source || jsonb_build_object('imported_on','2026-10-24','unsupported_methods',
    (select coalesce(jsonb_agg(m),'[]'::jsonb) from jsonb_array_elements_text(i.source->'payment_methods') m where m='boleto' or (p.type='subscription' and m='pix'))),
  '{"appearance_mode":"inherit","tracking_mode":"inherit"}'::jsonb
from guru_offer_import i join public.products p on p.code=(i.source->>'product_code')::bigint
on conflict(guru_offer_id) do update set name=excluded.name,price_cents=excluded.price_cents,payment_methods=excluded.payment_methods,
  max_installments=excluded.max_installments,free_installments=excluded.free_installments,monthly_interest_pct=excluded.monthly_interest_pct,
  interest_model=excluded.interest_model,default_installments=excluded.default_installments,billing_interval=excluded.billing_interval,
  billing_interval_count=excluded.billing_interval_count,billing_cycles=excluded.billing_cycles,guru_config=excluded.guru_config;
-- Imported offers stay inactive until the compatible deployment is READY.
do $$ begin
  if (select count(*) from public.offers where guru_offer_id is not null) <> 85 then raise exception 'Contagem final divergente'; end if;
end $$;
commit;
select count(*) as imported_offers,count(distinct product_id) as products from public.offers where guru_offer_id is not null;
`)
