alter table public.offers add column payment_path text;

create table public.checkout_offer_links (
  path text primary key,
  offer_id uuid not null references public.offers(id) on delete cascade deferrable initially deferred
);
create index checkout_offer_links_offer_id_idx on public.checkout_offer_links (offer_id);
alter table public.checkout_offer_links enable row level security;
revoke all on public.checkout_offer_links from public, anon, authenticated;
grant select, insert, update, delete on public.checkout_offer_links to service_role;

-- Reserve all previously published aliases before allocating any new names.
insert into public.checkout_offer_links(path, offer_id)
select checkout_config->>'payment_alias', id from public.offers
where nullif(checkout_config->>'payment_alias','') is not null;

create function public.reserve_checkout_offer_path() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  seed text;
  candidate text;
  suffix text;
  attempt integer := 1;
  owner_id uuid;
  previous_alias text := nullif(new.checkout_config->>'payment_alias','');
begin
  if tg_op = 'UPDATE' and new.payment_path is not distinct from old.payment_path then
    if previous_alias is distinct from nullif(old.checkout_config->>'payment_alias','') and previous_alias is not null then
      new.payment_path := previous_alias;
    elsif new.payment_path is not null then
      return new;
    end if;
  end if;
  if tg_op = 'INSERT' and previous_alias is not null and exists (
    select 1 from public.checkout_offer_links where path = previous_alias and offer_id <> new.id
  ) then
    -- Duplication copies the checkout appearance, but its address belongs to the original.
    new.checkout_config := new.checkout_config - 'payment_alias';
    previous_alias := null;
  end if;
  seed := coalesce(nullif(new.payment_path,''), previous_alias, new.name);
  seed := trim(both '-' from regexp_replace(lower(regexp_replace(normalize(seed, NFD), U&'[\0300-\036F]', '', 'g')), '[^a-z0-9]+','-','g'));
  seed := coalesce(nullif(rtrim(left(seed,60),'-'),''),'oferta');
  loop
    suffix := case when attempt = 1 then '' else '-' || attempt::text end;
    candidate := rtrim(left(seed,60-length(suffix)),'-') || suffix;
    -- Never take a legacy 22-character checkout code from its owner.
    if candidate !~ '^[A-Za-z0-9_-]{21}[AQgw]$' or candidate = previous_alias then
      insert into public.checkout_offer_links(path,offer_id) values(candidate,new.id)
        on conflict(path) do update set offer_id=excluded.offer_id
        where checkout_offer_links.offer_id=excluded.offer_id returning offer_id into owner_id;
      if owner_id is not null then exit; end if;
    end if;
    attempt := attempt + 1;
  end loop;
  new.payment_path := candidate;
  return new;
end $$;
revoke all on function public.reserve_checkout_offer_path() from public, anon, authenticated;
create trigger reserve_checkout_offer_path before insert or update of name, payment_path, checkout_config on public.offers
for each row execute function public.reserve_checkout_offer_path();

-- Assign names in creation order, including inactive offers, so reactivation is safe.
do $$ declare item record; begin
  for item in select id from public.offers where payment_path is null order by created_at,id loop
    update public.offers set payment_path = null where id = item.id;
  end loop;
end $$;
