-- Adição compatível: nenhum disparo HTTP, nenhuma ativação de destino.
alter table public.customers add column if not exists billing_address jsonb not null default '{}'::jsonb;
alter table public.outbound_webhooks add column if not exists payload_format text not null default 'native' check (payload_format in ('native','guru'));

-- Outbox transacional: confirmações repetidas não criam outro aviso.
-- Funções invoker, exclusivas do servidor; nenhuma chamada HTTP no banco.
create or replace function public.checkout_queue_outbound(p_order_id uuid, p_event public.webhook_event_type, p_subscription_id uuid default null)
returns void language plpgsql security invoker set search_path = public as $$
declare
  o public.orders%rowtype;
  origin public.orders%rowtype;
  snapshot jsonb;
  customer_data jsonb;
  item_data jsonb;
  selected_products uuid[];
  environment text;
  subscription_data jsonb;
  w record;
  delivery_id uuid;
begin
  select * into o from public.orders where id = p_order_id;
  if not found or not (o.event_id like 'checkout:%' or o.event_id like 'cycle:%') then return; end if;
  origin := o;
  if o.parent_order_id is not null then select * into origin from public.orders where id = o.parent_order_id; end if;
  if origin.event_id not like 'checkout:%' then return; end if;
  select payload into snapshot from public.webhook_events where pagarme_event_id = 'request:' || substring(origin.event_id from 10);
  environment := case coalesce(snapshot->>'gateway_base', snapshot#>>'{tracking,gateway_base}')
    when 'https://sdx-api.pagar.me/core/v5' then 'test'
    when 'https://api.pagar.me/core/v5' then 'live' else 'unknown' end;
  select jsonb_build_object('id',id,'name',name,'email',email,'phone',phone,'document',document,'billing_address',billing_address) into customer_data from public.customers where id=o.customer_id;
  select jsonb_agg(jsonb_build_object('product_id',p.id,'product_code',p.code::text,'product_name',p.name,'offer_id',i->>'offer_id','plan_id',i->>'plan_id','price_cents',i->'subtotal_cents','total_cents',i->'total_cents','discount_cents',i->'discount_cents','interest_cents',i->'interest_cents','kind',i->>'kind','image_url',p.image_url,'offer_name',f.name,'guru_offer_id',f.guru_offer_id)),
    array_agg(distinct p.id)
    into item_data, selected_products
    from jsonb_array_elements(coalesce(snapshot->'items','[]'::jsonb)) i
    join public.products p on p.id=(i->>'product_id')::uuid
    join public.offers f on f.id=(i->>'offer_id')::uuid;
  if selected_products is null then return; end if;
  select to_jsonb(s) into subscription_data from public.subscriptions s where s.id=p_subscription_id;
  if p_event::text='subscription.active' and (o.status::text<>'paid' or o.paid_at is null or coalesce(subscription_data->>'status','')<>'active') then return; end if;
  for w in select * from public.outbound_webhooks where active and p_event=any(events)
    and (outbound_webhooks.product_ids is null or outbound_webhooks.product_ids && selected_products)
  loop
    delivery_id := md5(w.id::text || ':' || p_event::text || ':' || o.id::text || ':' || coalesce(p_subscription_id::text,''))::uuid;
    insert into public.webhook_deliveries(id,webhook_id,event_type,order_id,subscription_id,payload)
    values(delivery_id,w.id,p_event,o.id,p_subscription_id,jsonb_build_object(
      'id',delivery_id,'event',p_event,'environment',environment,'created_at',now(),
      'order',jsonb_build_object('id',o.id,'status',o.status,'subtotal_cents',o.subtotal_cents,'discount_cents',o.discount_cents,'interest_cents',o.interest_cents,'total_cents',o.total_cents,'currency','BRL','payment_method',o.payment_method,'installments',o.installments,'paid_at',o.paid_at,'created_at',o.created_at,'pagarme_order_id',o.pagarme_order_id,'pagarme_charge_id',o.pagarme_charge_id),
      'customer',customer_data,'items',item_data,'subscription_id',p_subscription_id,'subscription',subscription_data,'source',snapshot->'tracking'))
    on conflict(id) do nothing;
  end loop;
end $$;


-- Assinatura ativa exige uma cobrança confirmada; criada não equivale a paga.
create or replace function public.checkout_outbound_subscription_trigger()
returns trigger language plpgsql security invoker set search_path = public as $$
declare e public.webhook_event_type; paid_order uuid;
begin
  if tg_op='INSERT' then
    perform public.checkout_queue_outbound(new.origin_order_id,'subscription.created',new.id);
  elsif old.status is distinct from new.status then
    e := case new.status::text when 'canceled' then 'subscription.canceled' when 'past_due' then 'subscription.past_due' else null end;
    if e is not null then perform public.checkout_queue_outbound(new.origin_order_id,e,new.id); end if;
  end if;
  if new.status::text='active' then
    select id into paid_order from public.orders where (id=new.origin_order_id or parent_order_id=new.origin_order_id) and status::text='paid' and paid_at is not null order by created_at desc limit 1;
    if paid_order is not null then perform public.checkout_queue_outbound(paid_order,'subscription.active',new.id); end if;
  end if;
  return new;
end $$;
-- Inclui atualizações de ciclo, mesmo quando o status continua ativo.
drop trigger if exists checkout_outbound_subscription on public.subscriptions;
create trigger checkout_outbound_subscription after insert or update on public.subscriptions for each row execute function public.checkout_outbound_subscription_trigger();

-- Somente os cadastros importados recebem o formato anterior; segredos não entram na auditoria.
update public.outbound_webhooks w set payload_format='guru',active=false
where exists(select 1 from public.webhook_events e where (e.pagarme_event_id like 'guru-sales-import:%' or e.pagarme_event_id like 'guru-subscription-import:%') and e.payload->>'target_id'=w.id::text);
update public.outbound_webhooks w set events=array['subscription.active']::public.webhook_event_type[]
where exists(select 1 from public.webhook_events e where e.pagarme_event_id like 'guru-subscription-import:%' and e.payload->>'target_id'=w.id::text and e.payload->>'source_status'='Ativa');

revoke all on function public.checkout_queue_outbound(uuid,public.webhook_event_type,uuid),public.checkout_outbound_subscription_trigger() from public,anon,authenticated;
grant execute on function public.checkout_queue_outbound(uuid,public.webhook_event_type,uuid),public.checkout_outbound_subscription_trigger() to service_role;
