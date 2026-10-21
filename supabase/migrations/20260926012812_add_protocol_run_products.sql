-- Applied remotely as add_protocol_run_products; existing campaigns keep their totals.
alter table public.protocol_runs add column products jsonb not null default '[]'::jsonb
  constraint protocol_runs_products_array check (jsonb_typeof(products) = 'array' and jsonb_array_length(products) <= 200);
-- Existing RLS and service-only grants are unchanged.
