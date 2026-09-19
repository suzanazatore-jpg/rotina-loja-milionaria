create policy "service role manages tutorial videos"
on public.tutorial_videos
for all
to service_role
using (true)
with check (true);
