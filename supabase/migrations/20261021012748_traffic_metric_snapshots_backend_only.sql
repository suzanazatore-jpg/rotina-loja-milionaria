create table public.traffic_metric_snapshots (
 meta_account_id text primary key,
 period_start date not null,
 period_end date not null,
 collected_at timestamptz not null,
 payload jsonb not null,
 check (period_start <= period_end),
 check (jsonb_typeof(payload) = 'object')
);
alter table public.traffic_metric_snapshots enable row level security;
revoke all on table public.traffic_metric_snapshots from public, anon, authenticated;
grant select, insert, update, delete on table public.traffic_metric_snapshots to service_role;
comment on table public.traffic_metric_snapshots is 'Coleta ampliada por conta. Acesso exclusivamente pelo backend, após validar plano e vínculo individual.';
