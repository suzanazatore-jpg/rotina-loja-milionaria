insert into public.plans (name, offer_id, period_days, price)
values
  ('Acesso individual · Calendário', '__individual_calendar', 36500, null),
  ('Acesso individual · Campanhas', '__individual_campaigns', 36500, null),
  ('Acesso individual · Rotina', '__individual_routine', 36500, null),
  ('Acesso individual · Calculadora de Metas', '__individual_team_goals', 36500, null)
on conflict (offer_id) do update
set name = excluded.name,
    period_days = excluded.period_days,
    updated_at = now();

insert into public.plan_app_contents (plan_id, content_key)
select p.id, dados.content_key
from (values
  ('__individual_calendar', 'calendar'),
  ('__individual_campaigns', 'campaigns'),
  ('__individual_routine', 'routine'),
  ('__individual_team_goals', 'team_goals')
) as dados(offer_id, content_key)
join public.plans p on p.offer_id = dados.offer_id
on conflict (plan_id, content_key) do nothing;
