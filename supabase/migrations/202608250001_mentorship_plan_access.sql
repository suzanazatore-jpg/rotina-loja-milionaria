-- Permite vincular as Aulas da Mentoria aos planos.
alter table public.plan_app_contents
  drop constraint if exists plan_app_contents_content_key_check;

alter table public.plan_app_contents
  add constraint plan_app_contents_content_key_check
  check (content_key in ('calendar', 'campaigns', 'routine', 'team_goals', 'mentorship'));

-- Restringe as gravações da Mentoria ao nível de acesso da aluna.
drop policy if exists alunas_veem_aulas on public.aulas;
drop policy if exists admin_gerencia_aulas on public.aulas;
drop policy if exists "Alunas autorizadas veem aulas da mentoria" on public.aulas;
drop policy if exists "Administrador gerencia aulas da mentoria" on public.aulas;

create policy "Alunas autorizadas veem aulas da mentoria"
  on public.aulas for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.status = 'active'
        and p.mentoria_aplicada = true
    )
    or exists (
      select 1 from public.perfis p
      where p.id = (select auth.uid())
        and p.tipo_acesso in ('mentoria', 'implementacao')
        and (p.acesso_expira_em is null or p.acesso_expira_em >= current_date)
    )
    or (select auth.jwt() ->> 'email') = 'suporte@suzanazatorre.com.br'
  );

create policy "Administrador gerencia aulas da mentoria"
  on public.aulas for all
  to authenticated
  using ((select auth.jwt() ->> 'email') = 'suporte@suzanazatorre.com.br')
  with check ((select auth.jwt() ->> 'email') = 'suporte@suzanazatorre.com.br');
