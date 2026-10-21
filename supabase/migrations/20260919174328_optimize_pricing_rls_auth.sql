alter policy pricing_calculations_owner_select
  on public.pricing_calculations
  using (
    (select auth.uid()) = owner_id
    and (
      (select auth.jwt()) ->> 'email' = 'suporte@suzanazatorre.com.br'
      or exists (
        select 1
        from public.profile_plans pp
        join public.profiles p on p.id = pp.profile_id
        join public.plan_app_contents pac on pac.plan_id = pp.plan_id
        where pp.profile_id = (select auth.uid())
          and p.status = 'active'
          and pac.content_key = 'pricing'
      )
    )
  );

alter policy pricing_calculations_owner_insert
  on public.pricing_calculations
  with check (
    (select auth.uid()) = owner_id
    and (
      (select auth.jwt()) ->> 'email' = 'suporte@suzanazatorre.com.br'
      or exists (
        select 1
        from public.profile_plans pp
        join public.profiles p on p.id = pp.profile_id
        join public.plan_app_contents pac on pac.plan_id = pp.plan_id
        where pp.profile_id = (select auth.uid())
          and p.status = 'active'
          and pac.content_key = 'pricing'
      )
    )
  );

alter policy pricing_calculations_owner_update
  on public.pricing_calculations
  using (
    (select auth.uid()) = owner_id
    and (
      (select auth.jwt()) ->> 'email' = 'suporte@suzanazatorre.com.br'
      or exists (
        select 1
        from public.profile_plans pp
        join public.profiles p on p.id = pp.profile_id
        join public.plan_app_contents pac on pac.plan_id = pp.plan_id
        where pp.profile_id = (select auth.uid())
          and p.status = 'active'
          and pac.content_key = 'pricing'
      )
    )
  )
  with check (
    (select auth.uid()) = owner_id
    and (
      (select auth.jwt()) ->> 'email' = 'suporte@suzanazatorre.com.br'
      or exists (
        select 1
        from public.profile_plans pp
        join public.profiles p on p.id = pp.profile_id
        join public.plan_app_contents pac on pac.plan_id = pp.plan_id
        where pp.profile_id = (select auth.uid())
          and p.status = 'active'
          and pac.content_key = 'pricing'
      )
    )
  );

alter policy pricing_calculations_owner_delete
  on public.pricing_calculations
  using (
    (select auth.uid()) = owner_id
    and (
      (select auth.jwt()) ->> 'email' = 'suporte@suzanazatorre.com.br'
      or exists (
        select 1
        from public.profile_plans pp
        join public.profiles p on p.id = pp.profile_id
        join public.plan_app_contents pac on pac.plan_id = pp.plan_id
        where pp.profile_id = (select auth.uid())
          and p.status = 'active'
          and pac.content_key = 'pricing'
      )
    )
  );
