-- Pictures in messages (with automatic clean-up), room co-owners, the
-- quiet-room prompt, committee members starting their own groups, rooms for
-- chosen people, and group admins managing their own groups.
-- Run once on a database that already has the baseline. Additive only.

-- ============================== pictures on messages ==============================
-- Paths in the message-images storage bucket, each under a folder named for
-- the room. images_removed_at is set by the daily clean-up when it removes a
-- message's pictures.
alter table public.messages add column if not exists image_paths text[] not null default '{}';
alter table public.messages add column if not exists images_removed_at timestamptz;
alter table public.messages drop constraint if exists messages_image_paths_max;
alter table public.messages add constraint messages_image_paths_max check (cardinality(image_paths) <= 4);

-- ============================== app settings ==============================
-- App-wide settings a global admin can change without a deploy. Anyone signed
-- in can read them; only a global admin can change them.
--   picture_retention_days  how long pictures in messages are kept (0 = forever)
--   room_coowner_email      optional; see room co-owners below
create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
alter table public.app_settings enable row level security;
drop policy if exists "app_settings_select" on public.app_settings;
create policy "app_settings_select" on public.app_settings for select to authenticated using (true);
drop policy if exists "app_settings_write" on public.app_settings;
create policy "app_settings_write" on public.app_settings for all to authenticated
  using (public.is_global_admin()) with check (public.is_global_admin());
insert into public.app_settings (key, value) values ('picture_retention_days', '90')
  on conflict (key) do nothing;

-- ============================== room co-owners ==============================
-- Optional. If app_settings has a 'room_coowner_email' (for example the
-- secretary's), that account is automatically a co-owner of every new group
-- room, so it can rename, close and pin the room alongside whoever created
-- it. With no such setting, nothing happens.
create table if not exists public.space_owners (
  space_id uuid not null references public.spaces(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  primary key (space_id, member_id)
);
alter table public.space_owners enable row level security;
drop policy if exists "space_owners_select" on public.space_owners;
create policy "space_owners_select" on public.space_owners for select
  using (public.can_see_space(space_id));

create or replace function public.is_space_owner(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from space_owners where space_id = sid and member_id = auth.uid());
$$;

drop policy if exists "spaces_update" on public.spaces;
create policy "spaces_update" on public.spaces for update
  using (public.is_group_admin(group_id) or created_by = auth.uid() or public.is_space_owner(id))
  with check (public.is_group_admin(group_id) or created_by = auth.uid() or public.is_space_owner(id));

-- ============================== quiet-room prompt ==============================
-- Set by the daily sweep when it asks the creator whether a room with no
-- messages for 30+ days should be closed; "dismissed" is the creator choosing
-- to keep it open (which hides the banner).
alter table public.spaces add column if not exists inactivity_prompted_at timestamptz;
alter table public.spaces add column if not exists inactivity_dismissed_at timestamptz;

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('decision_resolved', 'decision_reminder', 'task_reminder', 'task_overdue', 'room_inactive'));
alter table public.notifications add column if not exists space_id uuid references public.spaces(id) on delete cascade;

-- ============================== committee members start groups ==============================
-- A committee member (anyone in a group of kind 'committee') can start a
-- small working party themselves. It's a function, not a plain insert,
-- because the creator must become the group's first admin in the same step
-- and the table's own policy only lets existing admins add members.
create or replace function public.is_committee_member()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_global_admin() or exists (
    select 1
    from group_members gm
    join groups g on g.id = gm.group_id
    where gm.member_id = auth.uid() and g.kind = 'committee'
  );
$$;

create or replace function public.create_working_party(
  p_name text, p_description text, p_quorum int, p_member_ids uuid[]
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  gid uuid;
  mid uuid;
begin
  if auth.uid() is null or not public.is_committee_member() then
    raise exception 'Only committee members can start a group';
  end if;
  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'A group needs a name';
  end if;
  insert into groups (name, kind, description, default_quorum)
  values (btrim(p_name), 'working-party', nullif(btrim(coalesce(p_description, '')), ''),
          greatest(coalesce(p_quorum, 1), 1))
  returning id into gid;
  insert into group_members (group_id, member_id, is_admin) values (gid, auth.uid(), true);
  foreach mid in array coalesce(p_member_ids, '{}'::uuid[]) loop
    if mid <> auth.uid() and exists (select 1 from profiles where id = mid and active) then
      insert into group_members (group_id, member_id, is_admin) values (gid, mid, false)
      on conflict do nothing;
    end if;
  end loop;
  return gid;
end;
$$;
revoke execute on function public.create_working_party(text, text, int, uuid[]) from public, anon;
grant execute on function public.create_working_party(text, text, int, uuid[]) to authenticated;

-- A group's own admins may rename it and change its quorum (previously only a
-- global admin could, so a group admin's quorum edit silently did nothing).
-- Its kind is pinned so nobody can turn a working party into a committee.
drop policy if exists "groups_update_by_group_admin" on public.groups;
create policy "groups_update_by_group_admin" on public.groups for update
  using (public.is_group_admin(id)) with check (public.is_group_admin(id));

create or replace function public.pin_group_kind()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_global_admin() then
    new.kind := old.kind;
  end if;
  return new;
end;
$$;
drop trigger if exists groups_pin_kind on groups;
create trigger groups_pin_kind
  before update on groups
  for each row execute function public.pin_group_kind();

-- ============================== rooms for chosen people ==============================
-- A room only some people can see is a room in a small group made just for it.
-- create_room_for_people() makes both in one step; the group is marked
-- private_room so the app can list such rooms together and so the co-owner is
-- not automatically added to a room they can't see.
alter table public.groups add column if not exists private_room boolean not null default false;

create or replace function public.create_room_for_people(p_name text, p_member_ids uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare
  gid uuid;
  sid uuid;
  mid uuid;
  n int;
begin
  if auth.uid() is null or not public.is_committee_member() then
    raise exception 'Only committee members can start a room for chosen people';
  end if;
  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'A room needs a name';
  end if;
  insert into groups (name, kind, description, default_quorum, private_room)
  values (btrim(p_name), 'working-party', 'Created with the room "' || btrim(p_name) || '"', 1, true)
  returning id into gid;
  insert into group_members (group_id, member_id, is_admin) values (gid, auth.uid(), true);
  foreach mid in array coalesce(p_member_ids, '{}'::uuid[]) loop
    if mid <> auth.uid() and exists (select 1 from profiles where id = mid and active) then
      insert into group_members (group_id, member_id, is_admin) values (gid, mid, false)
      on conflict do nothing;
    end if;
  end loop;
  select count(*) into n from group_members where group_id = gid;
  update groups set default_quorum = n / 2 + 1 where id = gid;
  insert into spaces (group_id, name, visibility, created_by)
  values (gid, btrim(p_name), 'group', auth.uid())
  returning id into sid;
  return sid;
end;
$$;
revoke execute on function public.create_room_for_people(text, uuid[]) from public, anon;
grant execute on function public.create_room_for_people(text, uuid[]) to authenticated;

-- Adds the optional co-owner to a new group room. Never allowed to stop a
-- room being created, hence the exception handler.
create or replace function public.add_room_coowner()
returns trigger language plpgsql security definer set search_path = public as $$
declare owner_id uuid;
begin
  if new.visibility = 'group'
     and not coalesce((select g.private_room from groups g where g.id = new.group_id), false) then
    select p.id into owner_id
    from app_settings s
    join profiles p on lower(p.email) = lower(s.value)
    where s.key = 'room_coowner_email';
    if owner_id is not null and owner_id is distinct from new.created_by then
      insert into space_owners (space_id, member_id) values (new.id, owner_id)
      on conflict do nothing;
    end if;
  end if;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists spaces_add_coowner on spaces;
create trigger spaces_add_coowner
  after insert on spaces
  for each row execute function public.add_room_coowner();

-- A group's own admins may delete it -- working parties only. The committee
-- itself can't be deleted from the app. Deleting removes everything in the
-- group: its rooms and messages, motions and votes, tasks, documents and
-- meetings.
drop policy if exists "groups_delete_by_group_admin" on public.groups;
create policy "groups_delete_by_group_admin" on public.groups for delete
  using (kind = 'working-party' and public.is_group_admin(id));

-- ============================== message images ==============================
-- Pictures in room messages live in a PRIVATE storage bucket, one folder per
-- room (<space_id>/<uuid>.jpg). Access follows the room: whoever can see the
-- room can see and add its pictures; the uploader, or an admin of the room's
-- group, can remove them. The browser shrinks every picture before upload, so
-- the bucket also caps files at 5 MB and to image types only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('message-images', 'message-images', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.space_folder_visible(path text)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  return coalesce(public.can_see_space(split_part(path, '/', 1)::uuid), false);
exception when others then
  return false;
end;
$$;

-- Group rooms only: an admin of the room's group may remove its pictures.
create or replace function public.space_folder_admin(path text)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  return coalesce((
    select public.is_group_admin(s.group_id)
    from spaces s
    where s.id = split_part(path, '/', 1)::uuid and s.visibility = 'group'
  ), false);
exception when others then
  return false;
end;
$$;

drop policy if exists "message_images_read" on storage.objects;
create policy "message_images_read" on storage.objects for select to authenticated
  using (bucket_id = 'message-images' and public.space_folder_visible(name));
drop policy if exists "message_images_upload" on storage.objects;
create policy "message_images_upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'message-images' and public.space_folder_visible(name));
drop policy if exists "message_images_remove" on storage.objects;
create policy "message_images_remove" on storage.objects for delete to authenticated
  using (
    bucket_id = 'message-images'
    and (owner_id = auth.uid()::text or public.space_folder_admin(name))
  );

-- ============================== realtime ==============================
do $$
begin
  alter publication supabase_realtime add table public.space_owners;
exception when duplicate_object then
  null;
end;
$$;
