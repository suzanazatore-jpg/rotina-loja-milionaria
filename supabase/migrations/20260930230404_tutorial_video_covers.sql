-- Additive change only: existing videos keep their player without a cover.
-- The existing course-covers bucket and its permissions are unchanged.
alter table public.tutorial_videos
  add column if not exists cover_image_path text;

alter table public.tutorial_videos
  add constraint tutorial_videos_cover_image_path_check check (
    cover_image_path is null or cover_image_path ~ (
      '^tutorial-videos/' || module_key || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png)$'
    )
  );

comment on column public.tutorial_videos.cover_image_path is
  'Optional image path inside the existing course-covers bucket; only admin APIs write it.';
