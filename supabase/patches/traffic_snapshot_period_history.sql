-- Applied as migration traffic_snapshot_period_history. Existing snapshot rows are preserved.
alter table public.traffic_metric_snapshots drop constraint traffic_metric_snapshots_pkey;
alter table public.traffic_metric_snapshots add primary key(meta_account_id,period_start,period_end);
create table public.traffic_collection_runs (
 id uuid primary key default gen_random_uuid(), started_at timestamptz not null default now(), finished_at timestamptz,
 source text not null default 'meta_ads_mcp', status text not null check(status in ('running','success','partial','failed')),
 accounts_expected integer, accounts_saved integer not null default 0, details jsonb not null default '{}'::jsonb
);
alter table public.traffic_collection_runs enable row level security;
revoke all on public.traffic_collection_runs from anon,authenticated;
grant all on public.traffic_collection_runs to service_role;
