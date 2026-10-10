-- Cadastro individual de despesas fixas e percentual calculado sobre o faturamento previsto.
create table if not exists public.pricing_fixed_expenses (
  owner_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  rent numeric(12,2) not null default 0 check (rent >= 0),
  payroll numeric(12,2) not null default 0 check (payroll >= 0),
  utilities numeric(12,2) not null default 0 check (utilities >= 0),
  accounting numeric(12,2) not null default 0 check (accounting >= 0),
  systems numeric(12,2) not null default 0 check (systems >= 0),
  other_expenses numeric(12,2) not null default 0 check (other_expenses >= 0),
  forecast_revenue numeric(12,2) not null check (forecast_revenue > 0),
  updated_at timestamptz not null default now(),
  constraint pricing_fixed_expenses_ratio_valid check (
    rent + payroll + utilities + accounting + systems + other_expenses < forecast_revenue
  )
);
alter table public.pricing_fixed_expenses enable row level security;
revoke all on public.pricing_fixed_expenses from anon;
grant select, insert, update, delete on public.pricing_fixed_expenses to authenticated;
grant all on public.pricing_fixed_expenses to service_role;
create policy pricing_fixed_expenses_own_select on public.pricing_fixed_expenses for select to authenticated using (owner_id = (select auth.uid()));
create policy pricing_fixed_expenses_own_insert on public.pricing_fixed_expenses for insert to authenticated with check (owner_id = (select auth.uid()));
create policy pricing_fixed_expenses_own_update on public.pricing_fixed_expenses for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy pricing_fixed_expenses_own_delete on public.pricing_fixed_expenses for delete to authenticated using (owner_id = (select auth.uid()));

-- Percentuais sobre o PREÇO de venda, nunca sobre o custo do produto.
-- Registros antigos preservam os resultados anteriores (percentuais padrão zero).
alter table public.pricing_calculations
  add column if not exists card_fee_pct numeric(6,3) not null default 0 check (card_fee_pct >= 0 and card_fee_pct < 100),
  add column if not exists tax_pct numeric(6,3) not null default 0 check (tax_pct >= 0 and tax_pct < 100),
  add column if not exists fixed_expense_pct numeric(6,3) not null default 0 check (fixed_expense_pct >= 0 and fixed_expense_pct < 100);
alter table public.pricing_calculations
  add constraint pricing_positive_denominator check (
    desired_margin + card_fee_pct + tax_pct + fixed_expense_pct < 100
  );
alter table public.pricing_calculations
  drop column if exists suggested_price,
  drop column if exists profit,
  drop column if exists markup;
alter table public.pricing_calculations
  add column suggested_price numeric(12,2) generated always as (
    round((item_cost + fees + extra_costs) / (1 - (desired_margin + card_fee_pct + tax_pct + fixed_expense_pct) / 100), 2)
  ) stored,
  add column profit numeric(12,2) generated always as (
    round((item_cost + fees + extra_costs) * desired_margin /
      (100 - desired_margin - card_fee_pct - tax_pct - fixed_expense_pct), 2)
  ) stored,
  add column markup numeric(10,4) generated always as (
    round(1 / (1 - (desired_margin + card_fee_pct + tax_pct + fixed_expense_pct) / 100), 4)
  ) stored;
-- Impede novos registros sem despesas fixas validadas, sem alterar o histórico.
create or replace function public.validate_pricing_fixed_expenses()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_record public.pricing_fixed_expenses%rowtype;
  v_pct numeric;
begin
  select * into v_record from public.pricing_fixed_expenses where owner_id = new.owner_id;
  if not found then
    raise exception 'Cadastre suas despesas fixas antes de precificar';
  end if;
  v_pct := round(100 * (v_record.rent + v_record.payroll + v_record.utilities +
    v_record.accounting + v_record.systems + v_record.other_expenses) / v_record.forecast_revenue, 3);
  if new.fixed_expense_pct is distinct from v_pct then
    raise exception 'Atualize o percentual de despesas fixas antes de salvar';
  end if;
  return new;
end;
$$;
drop trigger if exists require_pricing_fixed_expenses on public.pricing_calculations;
create trigger require_pricing_fixed_expenses before insert on public.pricing_calculations
for each row execute function public.validate_pricing_fixed_expenses();
