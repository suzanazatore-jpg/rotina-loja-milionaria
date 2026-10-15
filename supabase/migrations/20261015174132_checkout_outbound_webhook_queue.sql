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
  select jsonb_build_object('name',name,'email',email,'phone',phone) into customer_data from public.customers where id=o.customer_id;
  select jsonb_agg(jsonb_build_object('product_id',p.id,'product_code',p.code::text,'product_name',p.name,'offer_id',i->>'offer_id','plan_id',i->>'plan_id','price_cents',i->'subtotal_cents')),
    array_agg(distinct p.id)
    into item_data, selected_products
    from jsonb_array_elements(coalesce(snapshot->'items','[]'::jsonb)) i
    join public.products p on p.id=(i->>'product_id')::uuid;
  if selected_products is null then return; end if;
  for w in select * from public.outbound_webhooks where active and p_event=any(events)
    and (outbound_webhooks.product_ids is null or outbound_webhooks.product_ids && selected_products)
  loop
    delivery_id := md5(w.id::text || ':' || p_event::text || ':' || o.id::text || ':' || coalesce(p_subscription_id::text,''))::uuid;
    insert into public.webhook_deliveries(id,webhook_id,event_type,order_id,subscription_id,payload)
    values(delivery_id,w.id,p_event,o.id,p_subscription_id,jsonb_build_object(
      'id',delivery_id,'event',p_event,'environment',environment,'created_at',now(),
      'order',jsonb_build_object('id',o.id,'status',o.status,'total_cents',o.total_cents,'currency','BRL','payment_method',o.payment_method,'paid_at',o.paid_at),
      'customer',customer_data,'items',item_data,'subscription_id',p_subscription_id))
    on conflict(id) do nothing;
  end loop;
end $$;

create or replace function public.checkout_outbound_order_trigger()
returns trigger language plpgsql security invoker set search_path = public as $$
declare e public.webhook_event_type;
begin
  if tg_op='UPDATE' and old.status is not distinct from new.status then return new; end if;
  e := case new.status::text when 'paid' then 'order.paid' when 'failed' then 'order.failed'
    when 'refunded' then 'order.refunded' when 'chargedback' then 'order.chargedback' else null end;
  if e is not null then perform public.checkout_queue_outbound(new.id,e); end if;
  if new.event_id like 'cycle:%' and new.status::text='paid' then
    perform public.checkout_queue_outbound(new.id,'subscription.renewed',s.id) from public.subscriptions s where s.origin_order_id=new.parent_order_id;
  end if;
  return new;
end $$;
create trigger checkout_outbound_order after insert or update of status on public.orders for each row execute function public.checkout_outbound_order_trigger();

create or replace function public.checkout_outbound_request_trigger()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new.type='checkout.request' and new.pagarme_event_id like 'request:%' then
    perform public.checkout_queue_outbound(o.id,'order.created') from public.orders o where o.event_id='checkout:' || substring(new.pagarme_event_id from 9);
  end if;
  return new;
end $$;
create trigger checkout_outbound_request after insert on public.webhook_events for each row execute function public.checkout_outbound_request_trigger();

create or replace function public.checkout_outbound_subscription_trigger()
returns trigger language plpgsql security invoker set search_path = public as $$
declare e public.webhook_event_type;
begin
  if tg_op='UPDATE' and old.status is not distinct from new.status then return new; end if;
  e := case when tg_op='INSERT' then 'subscription.created' when new.status::text='canceled' then 'subscription.canceled'
    when new.status::text='past_due' then 'subscription.past_due' else null end;
  if e is not null then perform public.checkout_queue_outbound(new.origin_order_id,e,new.id); end if;
  return new;
end $$;
create trigger checkout_outbound_subscription after insert or update of status on public.subscriptions for each row execute function public.checkout_outbound_subscription_trigger();

revoke all on function public.checkout_queue_outbound(uuid,public.webhook_event_type,uuid), public.checkout_outbound_order_trigger(), public.checkout_outbound_request_trigger(), public.checkout_outbound_subscription_trigger() from public,anon,authenticated;
grant execute on function public.checkout_queue_outbound(uuid,public.webhook_event_type,uuid), public.checkout_outbound_order_trigger(), public.checkout_outbound_request_trigger(), public.checkout_outbound_subscription_trigger() to service_role;
