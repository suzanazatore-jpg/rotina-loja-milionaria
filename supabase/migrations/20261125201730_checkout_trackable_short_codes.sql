alter table public.checkout_trackable_links
  add column short_code text,
  add constraint checkout_trackable_links_short_code_format
    check (char_length(short_code) <= 41 and short_code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  add constraint checkout_trackable_links_short_code_key unique (short_code);
