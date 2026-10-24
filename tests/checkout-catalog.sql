-- Executar no banco do app: transação revertida, sem compras ou mensagens.
begin;
set local role service_role;
do $$
declare source_id uuid; copied_id uuid; bump_id uuid; product_id uuid; original_slug text; original_price integer;
begin
  select o.id,o.product_id,o.slug,o.price_cents into source_id,product_id,original_slug,original_price from public.offers o where slug='protocolo-zerando-estoque-47';
  if source_id is null then raise exception 'Oferta de referência não encontrada'; end if;
  insert into public.offers(product_id,slug,name,price_cents,active) values(product_id,'catalog-rollback-'||gen_random_uuid(),'Adicional de verificação',100,false) returning id into bump_id;
  insert into public.order_bumps(offer_id,bump_offer_id,headline,position,active) values(source_id,bump_id,'Verificação',0,true);
  copied_id:=public.checkout_duplicate_offer(source_id);
  if not exists(select 1 from public.offers where id=copied_id and active=false and slug<>original_slug and price_cents=original_price) then raise exception 'Cópia incorreta'; end if;
  if not exists(select 1 from public.order_bumps where offer_id=copied_id and bump_offer_id=bump_id and headline='Verificação') then raise exception 'Adicional não copiado'; end if;
  if not exists(select 1 from public.webhook_events where type='checkout.catalog.admin' and payload->>'target_id'=copied_id::text and payload->>'actor'='suporte@suzanazatorre.com.br') then raise exception 'Auditoria ausente'; end if;
end $$;
do $$
declare source public.products; copy public.products; copied uuid;
begin
  select * into source from public.products where code=1790286704;
  copied:=public.checkout_duplicate_product(source.id);
  select * into copy from public.products where id=copied;
  if copy.code=source.code or copy.slug=source.slug or copy.active or copy.marketplace_id<>source.marketplace_id or copy.plan_id<>source.plan_id then raise exception 'Produto duplicado incorretamente'; end if;
  if exists(select 1 from public.offers where product_id=copied) then raise exception 'Produto duplicado não deve copiar ofertas'; end if;
end $$;
rollback;
