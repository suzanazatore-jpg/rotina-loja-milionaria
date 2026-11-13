alter table public.app_installations drop constraint if exists app_installations_evidence_check;
alter table public.app_installations add constraint app_installations_evidence_check
  check(evidence in ('standalone','appinstalled','legacy_browser','admin_confirmed'));
alter table public.app_installations add column if not exists confirmed_by uuid references auth.users(id);
alter table public.app_install_reminders add column if not exists channel text not null default 'email' check(channel in ('email','whatsapp'));
drop index if exists public.app_install_reminder_busy;
create unique index if not exists app_install_reminder_channel_busy on public.app_install_reminders(user_id,channel) where status='sending';
