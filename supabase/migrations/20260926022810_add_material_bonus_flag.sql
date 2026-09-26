alter table public.materials add column if not exists is_bonus boolean not null default false;
comment on column public.materials.is_bonus is 'PDF shown in Hoje > Bônus to students enrolled in its course';
