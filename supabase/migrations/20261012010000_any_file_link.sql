-- Documents and Library items can link to a file kept anywhere (Google Drive,
-- OneDrive, SharePoint, Dropbox...), not only Google Drive. Any secure web
-- address is accepted. Run once after the earlier migrations.
alter table public.documents drop constraint if exists documents_url_check;
alter table public.documents add constraint documents_url_check
  check (url ~* '^https://[^[:space:]/]+\.[^[:space:]/]+');
alter table public.library_items drop constraint if exists library_items_url_check;
alter table public.library_items add constraint library_items_url_check
  check (url ~* '^https://[^[:space:]/]+\.[^[:space:]/]+');
