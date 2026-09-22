-- The 20% margin is a warning threshold, not a mandatory minimum.
alter table public.pricing_calculations
  drop constraint pricing_calculations_desired_margin_check,
  drop constraint pricing_calculations_check,
  add constraint pricing_calculations_desired_margin_check
    check (desired_margin >= 0 and desired_margin <= 90),
  add constraint pricing_calculations_check
    check (minimum_margin >= 0 and minimum_margin <= 90);
