revoke all on public.campaign_task_progress from authenticated;
grant select, insert, delete on public.campaign_task_progress to authenticated;

create index if not exists campaign_task_progress_campaign_idx
  on public.campaign_task_progress(campaign_id);
