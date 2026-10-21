begin;
do $$
declare
 buyer uuid:=gen_random_uuid(); product uuid:=gen_random_uuid(); other_product uuid:=gen_random_uuid(); offer uuid:=gen_random_uuid();
 ord uuid:=gen_random_uuid(); hook uuid:=gen_random_uuid(); inactive uuid:=gen_random_uuid(); filtered uuid:=gen_random_uuid();
begin
 insert into public.customers(id,email,name) values(buyer,buyer||'@example.invalid','Webhook fixture');
 insert into public.products(id,name,slug) values(product,'Webhook fixture',product::text),(other_product,'Other fixture',other_product::text);
 insert into public.offers(id,product_id,name,slug,price_cents) values(offer,product,'Fixture',offer::text,4700);
 insert into public.outbound_webhooks(id,name,url,events,product_ids,active) values
 (hook,'Fixture','https://example.invalid/hook',array['order.created','order.paid','order.refunded','subscription.created','subscription.canceled']::public.webhook_event_type[],array[product],true),
 (inactive,'Inactive','https://example.invalid/hook',array['order.paid']::public.webhook_event_type[],null,false),
 (filtered,'Filtered','https://example.invalid/hook',array['order.paid']::public.webhook_event_type[],array[other_product],true);
 execute 'set local role service_role';
 insert into public.orders(id,customer_id,offer_id,payment_method,subtotal_cents,total_cents,event_id)
 values(ord,buyer,offer,'pix',4700,4700,'checkout:'||ord);
 insert into public.webhook_events(pagarme_event_id,type,payload)
 values('request:'||ord,'checkout.request',jsonb_build_object('gateway_base','https://sdx-api.pagar.me/core/v5','items',jsonb_build_array(jsonb_build_object('product_id',product,'offer_id',offer,'subtotal_cents',4700))));
 if (select count(*) from public.webhook_deliveries where order_id=ord and webhook_id=hook and event_type='order.created')<>1 then raise exception 'Created event missing'; end if;
 update public.orders set status='paid',paid_at=now() where id=ord;
 update public.orders set status='paid' where id=ord;
 perform public.checkout_queue_outbound(ord,'order.paid');
 if (select count(*) from public.webhook_deliveries where order_id=ord and webhook_id=hook and event_type='order.paid')<>1 then raise exception 'Paid event duplicate or missing'; end if;
 if exists(select 1 from public.webhook_deliveries where order_id=ord and webhook_id in(inactive,filtered)) then raise exception 'Inactive or product filtering failed'; end if;
 if not exists(select 1 from public.webhook_deliveries where order_id=ord and webhook_id=hook and payload->>'environment'='test' and payload#>>'{customer,email}'=buyer||'@example.invalid') then raise exception 'Payload missing'; end if;
 update public.orders set status='refunded' where id=ord;
 if (select count(*) from public.webhook_deliveries where order_id=ord and webhook_id=hook and event_type='order.refunded')<>1 then raise exception 'Refund missing'; end if;
 insert into public.subscriptions(customer_id,offer_id,origin_order_id,pagarme_subscription_id,status) values(buyer,offer,ord,'sub_'||replace(ord::text,'-',''),'active');
 update public.subscriptions set status='canceled' where origin_order_id=ord;
 if (select count(*) from public.webhook_deliveries where order_id=ord and webhook_id=hook and event_type in('subscription.created','subscription.canceled'))<>2 then raise exception 'Subscription events missing'; end if;
 if has_function_privilege('anon','public.checkout_queue_outbound(uuid,public.webhook_event_type,uuid)','execute') then raise exception 'Public queue exposure'; end if;
 raise notice 'PASS: queue, deduplication, filters, inactive, refund, subscription, environment and permissions';
end $$;
rollback;
