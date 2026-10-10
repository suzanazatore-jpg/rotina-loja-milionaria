-- Dois campos extras, opcionais, sem alterar cadastros anteriores.
alter table public.pricing_fixed_expenses
 add column if not exists other_expenses_2 numeric(12,2) not null default 0 check (other_expenses_2 >= 0),
 add column if not exists other_expenses_3 numeric(12,2) not null default 0 check (other_expenses_3 >= 0);
alter table public.pricing_fixed_expenses drop constraint if exists pricing_fixed_expenses_ratio_valid;
alter table public.pricing_fixed_expenses add constraint pricing_fixed_expenses_ratio_valid
 check (rent + payroll + utilities + accounting + systems + other_expenses + other_expenses_2 + other_expenses_3 < forecast_revenue);

create or replace function public.validate_pricing_fixed_expenses()
returns trigger language plpgsql security definer set search_path = public as $$
declare
 v_record public.pricing_fixed_expenses%rowtype;
 v_pct numeric;
begin
 select * into v_record from public.pricing_fixed_expenses where owner_id = new.owner_id;
 if not found then raise exception 'Cadastre suas despesas fixas antes de precificar'; end if;
 v_pct := round(100 * (v_record.rent + v_record.payroll + v_record.utilities +
  v_record.accounting + v_record.systems + v_record.other_expenses +
  v_record.other_expenses_2 + v_record.other_expenses_3) / v_record.forecast_revenue, 3);
 if new.fixed_expense_pct is distinct from v_pct then
  raise exception 'Atualize o percentual de despesas fixas antes de salvar';
 end if;
 return new;
end;
$$;