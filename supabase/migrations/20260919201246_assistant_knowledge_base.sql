create extension if not exists vector with schema extensions;

create table if not exists public.assistant_knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  source_type text not null,
  file_name text,
  file_path text,
  content text not null,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assistant_knowledge_title_length check (char_length(title) between 1 and 180),
  constraint assistant_knowledge_category_check check (
    category in ('general', 'app', 'routine', 'campaigns', 'calendar', 'team_goals', 'pricing', 'sales', 'whatsapp', 'instagram', 'team')
  ),
  constraint assistant_knowledge_source_check check (source_type in ('manual', 'pdf', 'docx', 'txt')),
  constraint assistant_knowledge_content_length check (char_length(content) between 3 and 500000)
);

create table if not exists public.assistant_knowledge_chunks (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.assistant_knowledge_documents(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  embedding extensions.vector(1536) not null,
  created_at timestamptz not null default now(),
  constraint assistant_knowledge_chunk_unique unique (document_id, chunk_index),
  constraint assistant_knowledge_chunk_length check (char_length(content) between 3 and 8000)
);

create index if not exists assistant_knowledge_chunks_embedding_idx
  on public.assistant_knowledge_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

create index if not exists assistant_knowledge_documents_active_category_idx
  on public.assistant_knowledge_documents (is_active, category, updated_at desc);

create index if not exists assistant_knowledge_documents_created_by_idx
  on public.assistant_knowledge_documents (created_by);

create table if not exists public.assistant_chat_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question text not null,
  answer text not null,
  sources jsonb not null default '[]'::jsonb,
  used_knowledge boolean not null default false,
  created_at timestamptz not null default now(),
  constraint assistant_chat_question_length check (char_length(question) between 1 and 2000),
  constraint assistant_chat_answer_length check (char_length(answer) between 1 and 10000),
  constraint assistant_chat_sources_array check (jsonb_typeof(sources) = 'array')
);

create index if not exists assistant_chat_history_user_created_idx
  on public.assistant_chat_history (user_id, created_at desc);

create index if not exists assistant_chat_history_unanswered_idx
  on public.assistant_chat_history (used_knowledge, created_at desc);

alter table public.assistant_knowledge_documents enable row level security;
alter table public.assistant_knowledge_chunks enable row level security;
alter table public.assistant_chat_history enable row level security;

revoke all on table public.assistant_knowledge_documents from anon, authenticated;
revoke all on table public.assistant_knowledge_chunks from anon, authenticated;
revoke all on table public.assistant_chat_history from anon, authenticated;

grant all on table public.assistant_knowledge_documents to service_role;
grant all on table public.assistant_knowledge_chunks to service_role;
grant all on table public.assistant_chat_history to service_role;
grant usage, select on sequence public.assistant_knowledge_chunks_id_seq to service_role;

create policy "service role manages assistant knowledge documents"
  on public.assistant_knowledge_documents for all to service_role
  using (true) with check (true);

create policy "service role manages assistant knowledge chunks"
  on public.assistant_knowledge_chunks for all to service_role
  using (true) with check (true);

create policy "service role manages assistant chat history"
  on public.assistant_chat_history for all to service_role
  using (true) with check (true);

create or replace function public.match_assistant_knowledge(
  query_embedding extensions.vector(1536),
  allowed_categories text[],
  match_count integer default 6,
  match_threshold double precision default 0.28
)
returns table (
  document_id uuid,
  title text,
  category text,
  content text,
  similarity double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    document.id,
    document.title,
    document.category,
    chunk.content,
    1 - (chunk.embedding OPERATOR(extensions.<=>) query_embedding) as similarity
  from public.assistant_knowledge_chunks as chunk
  join public.assistant_knowledge_documents as document on document.id = chunk.document_id
  where document.is_active = true
    and document.category = any(allowed_categories)
    and 1 - (chunk.embedding OPERATOR(extensions.<=>) query_embedding) >= match_threshold
  order by chunk.embedding OPERATOR(extensions.<=>) query_embedding
  limit least(greatest(match_count, 1), 10);
$$;

revoke all on function public.match_assistant_knowledge(extensions.vector, text[], integer, double precision) from public, anon, authenticated;
grant execute on function public.match_assistant_knowledge(extensions.vector, text[], integer, double precision) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'assistant-knowledge',
  'assistant-knowledge',
  false,
  10485760,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
