create table public.checkout_visits (
  id uuid primary key,
  product_id uuid not null,
  visited_at timestamptz not null default now(),
  campaign_id text,
  adset_id text,
  ad_id text,
  constraint checkout_visits_ad_ids check (
    num_nonnulls(campaign_id, adset_id, ad_id) = 0 or (
      num_nonnulls(campaign_id, adset_id, ad_id) = 3
      and campaign_id ~ '^[0-9]{5,30}$' and adset_id ~ '^[0-9]{5,30}$' and ad_id ~ '^[0-9]{5,30}$'
    )
  )
);

create index checkout_visits_date_idx on public.checkout_visits (visited_at);
create index checkout_visits_product_date_idx on public.checkout_visits (product_id, visited_at);
alter table public.checkout_visits enable row level security;
revoke all on table public.checkout_visits from public, anon, authenticated, service_role;
grant select, insert on table public.checkout_visits to service_role;

create function public.checkout_visit_report(p_from timestamptz, p_until timestamptz, p_product_id uuid default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with grouped as (
    select campaign_id, adset_id, ad_id, count(*) as visits
    from public.checkout_visits
    where visited_at >= p_from and visited_at < p_until and (p_product_id is null or product_id = p_product_id)
    group by campaign_id, adset_id, ad_id
  )
  select jsonb_build_object(
    'since', (select min(visited_at) from public.checkout_visits),
    'total', coalesce(sum(visits), 0),
    'by_ad', coalesce(jsonb_agg(jsonb_build_object(
      'campaign', campaign_id, 'adset', adset_id, 'ad', ad_id, 'count', visits
    )) filter (where ad_id is not null), '[]'::jsonb)
  ) from grouped;
$$;

revoke all on function public.checkout_visit_report(timestamptz, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.checkout_visit_report(timestamptz, timestamptz, uuid) to service_role;
