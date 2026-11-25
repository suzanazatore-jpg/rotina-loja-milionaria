create table public.checkout_trackable_links (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null,
  name text not null check (char_length(name) between 1 and 100),
  utm_source text not null check (char_length(utm_source) between 1 and 100),
  utm_medium text not null default '' check (char_length(utm_medium) <= 100),
  utm_campaign text not null default '' check (char_length(utm_campaign) <= 100),
  utm_content text not null default '' check (char_length(utm_content) <= 100),
  utm_term text not null default '' check (char_length(utm_term) <= 100),
  created_at timestamptz not null default now()
);

create index checkout_trackable_links_created_idx on public.checkout_trackable_links (created_at desc, id);

create table public.checkout_funnel_visits (
  id uuid primary key,
  offer_id uuid not null,
  model text not null check (model in ('official', 'compact', 'focused', 'guru')),
  link_id uuid references public.checkout_trackable_links (id),
  visitor text check (visitor ~ '^[0-9a-f]{64}$'),
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  visited_at timestamptz not null default now(),
  started_at timestamptz
);

create index checkout_funnel_visits_date_idx on public.checkout_funnel_visits (visited_at);
create index checkout_funnel_visits_offer_date_idx on public.checkout_funnel_visits (offer_id, visited_at);
create index checkout_funnel_visits_link_date_idx on public.checkout_funnel_visits (link_id, visited_at);

create table public.checkout_funnel_payments (
  event_id text primary key,
  visit_id uuid not null references public.checkout_funnel_visits (id),
  attempted_at timestamptz not null
);

create index checkout_funnel_payments_visit_idx on public.checkout_funnel_payments (visit_id);

alter table public.checkout_trackable_links enable row level security;
alter table public.checkout_funnel_visits enable row level security;
alter table public.checkout_funnel_payments enable row level security;

revoke all on public.checkout_trackable_links, public.checkout_funnel_visits, public.checkout_funnel_payments
  from public, anon, authenticated, service_role;
grant select, insert on public.checkout_trackable_links, public.checkout_funnel_payments to service_role;
grant select, insert on public.checkout_funnel_visits to service_role;
grant update (visit_id, attempted_at) on public.checkout_funnel_payments to service_role;
grant update (started_at) on public.checkout_funnel_visits to service_role;

create function public.checkout_funnel_record(
  p_visit uuid, p_offer uuid, p_model text, p_link uuid, p_referrer text,
  p_visitor text, p_started boolean, p_utm_source text, p_utm_medium text,
  p_utm_campaign text, p_utm_content text, p_utm_term text, p_session uuid,
  p_attempted_at timestamptz
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.checkout_funnel_visits (
    id, offer_id, model, link_id, referrer, visitor, started_at,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term
  )
  values (
    p_visit, p_offer, p_model, (
      select id from public.checkout_trackable_links where id = p_link and offer_id = p_offer
    ), p_referrer, p_visitor, case when p_started then now() end,
    p_utm_source, p_utm_medium, p_utm_campaign, p_utm_content, p_utm_term
  )
  on conflict (id) do nothing;

  if p_started then
    update public.checkout_funnel_visits
    set started_at = now()
    where id = p_visit and offer_id = p_offer and started_at is null;
  end if;

  if p_session is not null then
    insert into public.checkout_funnel_payments as existing (event_id, visit_id, attempted_at)
    values ('checkout:' || p_session::text, p_visit, p_attempted_at)
    on conflict (event_id) do update
      set visit_id = excluded.visit_id, attempted_at = excluded.attempted_at
      where excluded.attempted_at < existing.attempted_at;
  end if;
end;
$$;

create function public.checkout_funnel_report(
  p_from timestamptz, p_until timestamptz, p_offer uuid, p_link uuid, p_group text, p_offset integer
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with scoped as materialized (
    select v.id, v.visitor, v.started_at, v.offer_id,
      case p_group
        when 'link' then v.link_id::text
        when 'model' then v.model
        when 'offer' then v.offer_id::text
        when 'product' then o.product_id::text
        when 'source' then coalesce(v.utm_source, v.referrer)
        when 'medium' then v.utm_medium
        when 'campaign' then v.utm_campaign
        when 'creative' then v.utm_content
        when 'term' then v.utm_term
      end as key,
      case p_group
        when 'link' then l.name
        when 'offer' then o.name
        when 'product' then p.name
      end as label
    from public.checkout_funnel_visits v
    left join public.checkout_trackable_links l on p_group = 'link' and l.id = v.link_id
    left join public.offers o on p_group in ('offer', 'product') and o.id = v.offer_id
    left join public.products p on p_group = 'product' and p.id = o.product_id
    where v.visited_at >= p_from and v.visited_at < p_until
      and (p_offer is null or v.offer_id = p_offer)
      and (p_link is null or v.link_id = p_link)
  ), paid as (
    select s.id, count(*) as sales, sum(o.total_cents) as gross
    from scoped s
    join public.checkout_funnel_payments a on a.visit_id = s.id
    join public.orders o on o.event_id = a.event_id and o.offer_id = s.offer_id
    where o.status = 'paid' and o.paid_at is not null
    group by s.id
  ), metrics as (
    select s.key, s.label, grouping(s.key) as summary,
      count(*) as visits,
      count(distinct s.visitor) as visitors,
      count(*) filter (where s.started_at is not null) as starts,
      count(*) filter (where s.started_at <= now() - interval '24 hours' and paid.id is null) as abandoned,
      count(*) filter (where paid.id is not null) as converted,
      coalesce(sum(paid.sales), 0) as sales,
      coalesce(sum(paid.gross), 0) as gross
    from scoped s
    left join paid on paid.id = s.id
    group by grouping sets ((s.key, s.label), ())
  ), page as (
    select key, label, visits, visitors, starts, abandoned, converted, sales, gross
    from metrics where summary = 0
    order by visits desc, key nulls last
    limit 25 offset p_offset
  )
  select jsonb_build_object(
    'totals', (select to_jsonb(m) - array['key','label','summary'] from metrics m where summary = 1),
    'groupCount', (select count(*) from metrics where summary = 0),
    'rows', (select coalesce(jsonb_agg(to_jsonb(page) order by visits desc, key nulls last), '[]'::jsonb) from page)
  );
$$;

revoke all on function public.checkout_funnel_record(uuid, uuid, text, uuid, text, text, boolean, text, text, text, text, text, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.checkout_funnel_record(uuid, uuid, text, uuid, text, text, boolean, text, text, text, text, text, uuid, timestamptz)
  to service_role;
revoke all on function public.checkout_funnel_report(timestamptz, timestamptz, uuid, uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.checkout_funnel_report(timestamptz, timestamptz, uuid, uuid, text, integer)
  to service_role;
