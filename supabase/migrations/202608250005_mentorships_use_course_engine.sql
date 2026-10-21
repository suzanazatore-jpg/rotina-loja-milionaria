alter table public.courses add column if not exists is_mentorship boolean not null default false;
alter table public.courses add column if not exists mentorship_type text;
alter table public.courses drop constraint if exists courses_mentorship_type_check;
alter table public.courses add constraint courses_mentorship_type_check check (mentorship_type is null or mentorship_type in ('evs','cvm'));
create unique index if not exists courses_mentorship_type_unique on public.courses(mentorship_type) where is_mentorship = true;
insert into public.courses(slug,title,subtitle,description,is_published,comments_enabled,is_mentorship,mentorship_type,sort_order)
values ('mentoria-evs','Mentoria EVS','Aulas e encontros da Mentoria EVS','Conteúdos, gravações e materiais da Mentoria EVS.',true,true,true,'evs',900),('mentoria-cvm','Mentoria CVM','Aulas e encontros da Mentoria CVM','Conteúdos, gravações e materiais da Mentoria CVM.',true,true,true,'cvm',901)
on conflict (slug) do update set is_mentorship=true,mentorship_type=excluded.mentorship_type,comments_enabled=true;
insert into public.modules(course_id,title,description,sort_order,is_published)
select c.id,'Aulas da Mentoria','Gravações e encontros disponíveis.',0,true from public.courses c where c.is_mentorship=true and not exists(select 1 from public.modules m where m.course_id=c.id);
insert into public.lessons(course_id,module_id,slug,title,description,video_url,sort_order,is_published)
select c.id,m.id,'mentoria-legado-'||a.id,a.titulo,a.descricao,a.video_url,a.ordem,true from public.aulas a join public.courses c on c.mentorship_type=a.mentorship_type and c.is_mentorship=true join lateral(select id from public.modules where course_id=c.id order by sort_order limit 1)m on true where not exists(select 1 from public.lessons l where l.course_id=c.id and l.slug='mentoria-legado-'||a.id);
insert into public.materials(course_id,lesson_id,title,file_url,sort_order,is_published)
select l.course_id,l.id,mm.title,mm.file_url,mm.sort_order,true from public.mentorship_materials mm join public.lessons l on l.slug='mentoria-legado-'||mm.aula_id where not exists(select 1 from public.materials x where x.lesson_id=l.id and x.title=mm.title and x.file_url=mm.file_url);
