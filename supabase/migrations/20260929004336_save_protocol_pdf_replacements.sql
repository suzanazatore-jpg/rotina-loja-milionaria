-- Commit the reviewed PDF replacements and all protocol settings atomically.
-- Invoker rights retain the existing admin RLS policies; students cannot call it.
create or replace function public.save_protocol_with_pdf_replacements(
  p_course_id uuid, p_enabled boolean, p_offer_url text, p_lessons jsonb
) returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  item jsonb;
  replacement jsonb;
  v_lesson_id uuid;
  material public.materials%rowtype;
  new_path text;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Acesso exclusivo do ADM.' using errcode = '42501';
  end if;
  if p_offer_url is not null and p_offer_url !~* '^https://' then
    raise exception 'O link da mentoria deve começar com https://.';
  end if;
  if p_lessons is null or jsonb_typeof(p_lessons) <> 'array' then
    raise exception 'Aulas inválidas.';
  end if;
  -- Serialize edits to this course, and reject stale replacement previews.
  perform 1 from public.courses where id=p_course_id for update;
  if not found then raise exception 'Curso não encontrado.'; end if;
  for item in select value from jsonb_array_elements(p_lessons) loop
    v_lesson_id := (item->>'id')::uuid;
    perform 1 from public.lessons where id=v_lesson_id and course_id=p_course_id for update;
    if not found then raise exception 'Aula não encontrada neste curso.'; end if;
    if item->>'description' is null or char_length(item->>'description')>2000
      or coalesce(jsonb_typeof(item->'protocol_checklist'),'null') <> 'array' then
      raise exception 'Confira a orientação e as ações da aula.';
    end if;
    if jsonb_array_length(item->'protocol_checklist')>20 or exists (
      select 1 from jsonb_array_elements(item->'protocol_checklist') a
      where jsonb_typeof(a)<>'string' or char_length(a #>> '{}')>180 or btrim(a #>> '{}')=''
    ) or char_length(coalesce(item->>'protocol_notification',''))>180 then
      raise exception 'Confira as ações e o lembrete da aula.';
    end if;
    replacement := item->'replacement';
    if replacement is not null and replacement <> 'null'::jsonb then
      if jsonb_array_length(item->'protocol_checklist')=0 then raise exception 'Revise as tarefas antes de substituir o PDF.'; end if;
      select * into material from public.materials
        where id=(replacement->>'material_id')::uuid and course_id=p_course_id and materials.lesson_id=v_lesson_id for update;
      if not found then raise exception 'PDF não encontrado nesta aula.'; end if;
      if material.file_url is distinct from replacement->>'expected_url' then
        raise exception 'Este PDF já foi alterado. Recarregue a página antes de tentar novamente.';
      end if;
      new_path := substring(replacement->>'file_url' from 28);
      if coalesce(replacement->>'file_url','') not like 'storage://course-materials/' || p_course_id::text || '/' || v_lesson_id::text || '/%'
        or new_path is null or new_path ~ '(^|/)\.\.(/|$)'
        or not exists (select 1 from storage.objects where bucket_id='course-materials' and name=new_path)
        or coalesce(btrim(replacement->>'title'),'')='' then
        raise exception 'Novo PDF inválido ou não enviado. Envie o arquivo novamente.';
      end if;
      update public.materials set file_url=replacement->>'file_url',title=replacement->>'title' where id=material.id;
      if not found then raise exception 'Não foi possível substituir o PDF.'; end if;
    end if;
    update public.lessons set description=item->>'description',protocol_checklist=item->'protocol_checklist',
      protocol_notification=nullif(item->>'protocol_notification','') where id=v_lesson_id and course_id=p_course_id;
    if not found then raise exception 'Não foi possível atualizar as tarefas.'; end if;
  end loop;
  update public.courses set protocol_enabled=p_enabled,protocol_offer_url=p_offer_url where id=p_course_id;
  if not found then raise exception 'Não foi possível salvar o curso.'; end if;
end;
$$;
revoke all on function public.save_protocol_with_pdf_replacements(uuid,boolean,text,jsonb) from public,anon;
grant execute on function public.save_protocol_with_pdf_replacements(uuid,boolean,text,jsonb) to authenticated;
