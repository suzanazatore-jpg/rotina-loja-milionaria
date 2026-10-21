-- Separa as gravações entre EVS e CVM sem criar um novo conteúdo no plano.
alter table public.aulas
  add column if not exists mentorship_type text not null default 'evs';

alter table public.aulas
  drop constraint if exists aulas_mentorship_type_check;

alter table public.aulas
  add constraint aulas_mentorship_type_check
  check (mentorship_type in ('evs', 'cvm'));

create table if not exists public.plan_mentorships (
  plan_id uuid not null references public.plans(id) on delete cascade,
  mentorship_type text not null check (mentorship_type in ('evs', 'cvm')),
  created_at timestamptz not null default now(),
  primary key (plan_id, mentorship_type)
);

alter table public.plan_mentorships enable row level security;

grant select on public.plan_mentorships to authenticated;
grant select, insert, update, delete on public.plan_mentorships to service_role;
grant insert, update, delete on public.plan_mentorships to authenticated;

drop policy if exists "Alunas autenticadas veem as mentorias dos planos" on public.plan_mentorships;
create policy "Alunas autenticadas veem as mentorias dos planos"
  on public.plan_mentorships for select
  to authenticated
  using ((select auth.uid()) is not null);

drop policy if exists "Administrador gerencia mentorias dos planos" on public.plan_mentorships;
create policy "Administrador gerencia mentorias dos planos"
  on public.plan_mentorships for all
  to authenticated
  using ((select auth.jwt() ->> 'email') = 'suporte@suzanazatorre.com.br')
  with check ((select auth.jwt() ->> 'email') = 'suporte@suzanazatorre.com.br');

-- Mantém os planos que já liberavam Aulas da Mentoria funcionando.
insert into public.plan_mentorships (plan_id, mentorship_type)
select pac.plan_id,
       case when lower(p.name) like '%cvm%' then 'cvm' else 'evs' end
from public.plan_app_contents pac
join public.plans p on p.id = pac.plan_id
where pac.content_key = 'mentorship'
on conflict do nothing;

