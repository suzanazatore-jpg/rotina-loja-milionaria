create table if not exists public.mentorship_materials (
  id uuid primary key default gen_random_uuid(),
  aula_id integer not null references public.aulas(id) on delete cascade,
  title text not null,
  file_url text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.mentorship_comments (
  id uuid primary key default gen_random_uuid(),
  aula_id integer not null references public.aulas(id) on delete cascade,
  profile_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid references public.mentorship_comments(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  is_admin_reply boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists mentorship_materials_aula_idx on public.mentorship_materials(aula_id);
create index if not exists mentorship_comments_owner_idx on public.mentorship_comments(profile_id, aula_id);
alter table public.mentorship_materials enable row level security;
alter table public.mentorship_comments enable row level security;
grant select, insert, update, delete on public.mentorship_materials to authenticated, service_role;
grant select, insert, update, delete on public.mentorship_comments to service_role;

drop policy if exists "Administrador gerencia materiais da mentoria" on public.mentorship_materials;
create policy "Administrador gerencia materiais da mentoria" on public.mentorship_materials for all to authenticated
using ((select auth.jwt()->>'email') = 'suporte@suzanazatorre.com.br')
with check ((select auth.jwt()->>'email') = 'suporte@suzanazatorre.com.br');
