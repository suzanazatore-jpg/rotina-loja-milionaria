-- Keep protocol history in the same inbox as the other app notifications.
alter table public.user_notifications drop constraint user_notifications_target_url_check;
alter table public.user_notifications add constraint user_notifications_target_url_check
  check (target_url = '/painel' or target_url like '/painel?%' or target_url like '/painel/%' or target_url like '/protocolo/%');

with ordered_lessons as (
  select id, course_id, title, protocol_notification,
    row_number() over (partition by course_id order by sort_order, created_at) as day
  from public.lessons where is_published = true
), deliveries as (
  select owner_id, course_id, lesson_id, min(created_at) as first_sent, max(created_at) as last_sent, count(*) as devices
  from public.protocol_notification_deliveries group by owner_id, course_id, lesson_id
)
insert into public.user_notifications
  (id, user_id, notification_type, title, body, target_url, scheduled_for, sent_at, push_sent_at, push_device_count, created_at)
select md5('protocol:' || d.owner_id::text || ':' || d.lesson_id::text)::uuid,
  d.owner_id, 'personalizada', 'Dia ' || l.day || ' do seu Protocolo',
  left(coalesce(nullif(l.protocol_notification,''), 'Sua missão de hoje é: ' || l.title || '. Toque para abrir a aula.'), 240),
  '/protocolo/' || c.slug || '?aula=' || l.id,
  (d.first_sent at time zone 'America/Sao_Paulo')::date, d.first_sent, d.last_sent, d.devices::integer, d.first_sent
from deliveries d join ordered_lessons l on l.id=d.lesson_id join public.courses c on c.id=d.course_id
on conflict (id) do nothing;
