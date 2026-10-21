create table if not exists public.app_content_access_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  content_type text not null default 'app',
  content_id text,
  content_title text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint app_content_access_event_type_check check (event_type in ('app_open','section_open','course_open','lesson_open','material_open')),
  constraint app_content_access_type_length check (char_length(content_type) between 1 and 40),
  constraint app_content_access_id_length check (content_id is null or char_length(content_id) <= 180),
  constraint app_content_access_title_length check (content_title is null or char_length(content_title) <= 240),
  constraint app_content_access_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index if not exists app_content_access_user_created_idx
  on public.app_content_access_events (user_id, created_at desc);
create index if not exists app_content_access_user_content_idx
  on public.app_content_access_events (user_id, content_type, content_id, created_at desc);

alter table public.app_content_access_events enable row level security;
revoke all on table public.app_content_access_events from anon, authenticated;
grant all on table public.app_content_access_events to service_role;
grant usage, select on sequence public.app_content_access_events_id_seq to service_role;

drop policy if exists "service role manages content access events" on public.app_content_access_events;
create policy "service role manages content access events"
  on public.app_content_access_events for all to service_role
  using (true) with check (true);

create table if not exists public.assistant_course_knowledge_chunks (
  id bigint generated always as identity primary key,
  course_id uuid not null references public.courses(id) on delete cascade,
  lesson_id uuid references public.lessons(id) on delete cascade,
  material_id uuid references public.materials(id) on delete cascade,
  source_key text not null,
  source_type text not null,
  title text not null,
  chunk_index integer not null,
  content text not null,
  embedding extensions.vector(1536) not null,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  constraint assistant_course_source_type_check check (source_type in ('lesson_summary','pdf')),
  constraint assistant_course_source_key_length check (char_length(source_key) between 1 and 220),
  constraint assistant_course_title_length check (char_length(title) between 1 and 240),
  constraint assistant_course_chunk_length check (char_length(content) between 3 and 8000),
  constraint assistant_course_source_chunk_unique unique (source_key, chunk_index)
);

create index if not exists assistant_course_knowledge_embedding_idx
  on public.assistant_course_knowledge_chunks
  using hnsw (embedding extensions.vector_cosine_ops);
create index if not exists assistant_course_knowledge_course_idx
  on public.assistant_course_knowledge_chunks (course_id, lesson_id, material_id);
create index if not exists assistant_course_knowledge_source_idx
  on public.assistant_course_knowledge_chunks (source_key);
create index if not exists assistant_course_knowledge_lesson_idx
  on public.assistant_course_knowledge_chunks (lesson_id);
create index if not exists assistant_course_knowledge_material_idx
  on public.assistant_course_knowledge_chunks (material_id);

alter table public.assistant_course_knowledge_chunks enable row level security;
revoke all on table public.assistant_course_knowledge_chunks from anon, authenticated;
grant all on table public.assistant_course_knowledge_chunks to service_role;
grant usage, select on sequence public.assistant_course_knowledge_chunks_id_seq to service_role;

drop policy if exists "service role manages course knowledge" on public.assistant_course_knowledge_chunks;
create policy "service role manages course knowledge"
  on public.assistant_course_knowledge_chunks for all to service_role
  using (true) with check (true);

create or replace function public.match_assistant_course_knowledge(
  query_embedding extensions.vector(1536),
  allowed_course_ids uuid[],
  match_count integer default 6,
  match_threshold double precision default 0.24
)
returns table (
  course_id uuid,
  lesson_id uuid,
  material_id uuid,
  title text,
  source_type text,
  content text,
  similarity double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    chunk.course_id,
    chunk.lesson_id,
    chunk.material_id,
    chunk.title,
    chunk.source_type,
    chunk.content,
    1 - (chunk.embedding OPERATOR(extensions.<=>) query_embedding) as similarity
  from public.assistant_course_knowledge_chunks as chunk
  where chunk.course_id = any(allowed_course_ids)
    and 1 - (chunk.embedding OPERATOR(extensions.<=>) query_embedding) >= match_threshold
  order by chunk.embedding OPERATOR(extensions.<=>) query_embedding
  limit least(greatest(match_count, 1), 10);
$$;

revoke all on function public.match_assistant_course_knowledge(extensions.vector, uuid[], integer, double precision) from public, anon, authenticated;
grant execute on function public.match_assistant_course_knowledge(extensions.vector, uuid[], integer, double precision) to service_role;

-- Índices das consultas mais usadas no celular (lista de cursos, aulas e progresso).
create index if not exists enrollments_profile_active_idx
  on public.enrollments (profile_id, status, expires_at, course_id);
create index if not exists enrollments_course_idx
  on public.enrollments (course_id);
create index if not exists lessons_course_published_order_idx
  on public.lessons (course_id, is_published, sort_order);
create index if not exists lessons_module_idx
  on public.lessons (module_id);
create index if not exists materials_course_published_order_idx
  on public.materials (course_id, is_published, sort_order);
create index if not exists materials_lesson_idx
  on public.materials (lesson_id);
create index if not exists lesson_progress_profile_completed_idx
  on public.lesson_progress (profile_id, completed, lesson_id);
create index if not exists lesson_progress_lesson_idx
  on public.lesson_progress (lesson_id);
create index if not exists modules_course_published_order_idx
  on public.modules (course_id, is_published, sort_order);
