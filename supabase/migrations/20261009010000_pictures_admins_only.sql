-- Lets a deployment keep pictures in messages to global admins only, by
-- setting app_settings 'pictures_admins_only' to 'true'. Used by the public
-- demos, where anyone can sign in as the guest. With the setting absent,
-- nothing changes: every member can add pictures.
create or replace function public.pictures_allowed()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_global_admin() or not exists (
    select 1 from app_settings where key = 'pictures_admins_only' and value = 'true'
  );
$$;
revoke execute on function public.pictures_allowed() from public, anon;
grant execute on function public.pictures_allowed() to authenticated;

drop policy if exists "message_images_upload" on storage.objects;
create policy "message_images_upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'message-images'
    and public.space_folder_visible(name)
    and public.pictures_allowed()
  );
