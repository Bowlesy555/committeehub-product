-- Quorum database schema + row level security
-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query) on a fresh project.

create extension if not exists "pgcrypto";

-- ============================== tables ==============================

create table public.skill_areas (
  id text primary key,
  label text not null,
  sort_order int not null default 0
);

-- Committee roles/titles (Chairperson, Treasurer, ...) -- maintained from the
-- Admin tab rather than hardcoded, so any global admin can add to the list.
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null default 'New member',
  is_global_admin boolean not null default false,
  active boolean not null default true,
  is_vacant boolean not null default false,
  capacity text not null default 'available' check (capacity in ('available','stretched','away')),
  created_at timestamptz not null default now()
);

create table public.member_skills (
  member_id uuid not null references public.profiles(id) on delete cascade,
  skill_id text not null references public.skill_areas(id) on delete cascade,
  level smallint not null default 0 check (level between 0 and 3),
  primary key (member_id, skill_id)
);

-- A member can hold more than one role (e.g. Secretary AND Membership
-- Secretary), so this is many-to-many rather than a single column.
create table public.member_roles (
  member_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  primary key (member_id, role_id)
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'working-party' check (kind in ('committee','working-party')),
  description text,
  default_quorum int not null default 1,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  is_admin boolean not null default false,
  primary key (group_id, member_id)
);

create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  -- null for a private room/DM, which is scoped to its explicit participant
  -- list (space_participants) instead of a group's whole membership.
  group_id uuid references public.groups(id) on delete cascade,
  name text not null,
  status text not null default 'open' check (status in ('open','closed')),
  visibility text not null default 'group' check (visibility in ('group','private')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  -- denormalized pointer to the latest message, kept up to date by a
  -- trigger below. Lets the client compute unread dots and play a
  -- notification sound just by watching the existing `spaces` realtime
  -- subscription, instead of a separate listener over every message.
  last_message_at timestamptz,
  last_message_by uuid references public.profiles(id) on delete set null,
  -- pinning is shared, not personal -- pinning a room puts it at the top for
  -- everyone in it. pinned_until null + pinned true = pinned indefinitely;
  -- a real timestamp = auto-reverts to normal sort order after that time
  -- (computed client-side, nothing un-sets `pinned` automatically).
  pinned boolean not null default false,
  pinned_until timestamptz,
  constraint spaces_group_visibility check (
    (visibility = 'group' and group_id is not null) or (visibility = 'private')
  )
);

-- Who can see a private room/DM. Only used when spaces.visibility = 'private'
-- -- a 'group' room's visibility comes entirely from group_members instead.
create table public.space_participants (
  space_id uuid not null references public.spaces(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  primary key (space_id, member_id)
);

-- Topics within a room (e.g. one per TV programme, or Fire Extinguishers /
-- Camping / Entries inside a yearly championship room). Messages with no
-- topic_id sit in the room's implicit "General" topic.
create table public.space_topics (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  name text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  -- if a topic is ever removed by hand, its messages fall back to General
  topic_id uuid references public.space_topics(id) on delete set null,
  author_id uuid references public.profiles(id) on delete set null,
  text text not null,
  created_at timestamptz not null default now(),
  -- set by a trigger (below) whenever the text is changed after posting
  edited_at timestamptz
);

-- Tracks, per member per room, when they last viewed it -- compared against
-- spaces.last_message_at to decide whether a room shows an unread dot.
create table public.space_reads (
  space_id uuid not null references public.spaces(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (space_id, member_id)
);

-- In-app notifications (decision resolved, deadline reminder, ...) -- shown
-- as a bell/dot in the app instead of relying on email deliverability.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('decision_resolved', 'decision_reminder', 'task_reminder', 'task_overdue')),
  title text not null,
  body text,
  decision_id uuid references public.decisions(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  space_id uuid references public.spaces(id) on delete set null,
  -- the topic within that room the motion was raised from (opens straight to it)
  topic_id uuid references public.space_topics(id) on delete set null,
  title text not null,
  motion_text text not null,
  proposed_by uuid references public.profiles(id) on delete set null,
  quorum int not null default 1,
  deadline timestamptz not null default (now() + interval '5 days'),
  status text not null default 'open' check (status in ('open','passed','failed','withdrawn')),
  -- the set of choices members can vote for; defaults to a plain yes/no/abstain
  -- motion, but a proposer can customise this to any list of options (e.g. for
  -- picking between venues) via the "customise vote options" toggle.
  vote_options text[] not null default array['yes','no','abstain'],
  -- which option reached quorum first, once resolved. For the default
  -- yes/no/abstain set this mirrors `status` (passed<->yes, failed<->no); for
  -- a custom option set this is the only place the actual outcome is recorded.
  resolved_choice text,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  -- idempotency flags so the cron/notify routes never double-send an email
  reminder_sent boolean not null default false,
  resolution_notified boolean not null default false
);

create table public.votes (
  decision_id uuid not null references public.decisions(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  -- must be one of the parent decision's vote_options -- enforced by the
  -- validate_vote_choice trigger below rather than a check constraint, since
  -- a check constraint can't reference another table.
  choice text not null,
  voted_at timestamptz not null default now(),
  primary key (decision_id, member_id)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  space_id uuid references public.spaces(id) on delete set null,
  topic_id uuid references public.space_topics(id) on delete set null,
  decision_id uuid references public.decisions(id) on delete set null,
  title text not null,
  description text,
  assignee_id uuid references public.profiles(id) on delete set null,
  status text not null default 'todo' check (status in ('todo','doing','done','blocked')),
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  due_date date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  -- idempotency flags so the cron reminder route never double-sends; reset
  -- by a trigger (below) whenever due_date or assignee_id changes, so a
  -- pushed-back deadline or a reassignment gets a fresh reminder.
  due_reminder_sent boolean not null default false,
  overdue_notified boolean not null default false
);

create table public.task_skill_tags (
  task_id uuid not null references public.tasks(id) on delete cascade,
  skill_id text not null references public.skill_areas(id) on delete cascade,
  primary key (task_id, skill_id)
);

-- Who a task is assigned to -- any number of people. tasks.assignee_id above
-- is the older single-assignee column: kept so nothing breaks, but no longer
-- read or written by the app.
create table public.task_assignees (
  task_id uuid not null references public.tasks(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  primary key (task_id, member_id)
);

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  title text not null,
  scheduled_at timestamptz not null,
  location text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Set once meetings exists -- tasks is defined above it, so this can't be a
-- column on the original create table without reordering both.
alter table public.tasks add column meeting_id uuid references public.meetings(id) on delete set null;

-- Same reasoning: notifications is defined above tasks.
alter table public.notifications add column task_id uuid references public.tasks(id) on delete cascade;

-- A pointer to a file already stored in Google Drive -- deliberately never
-- the file itself. Supabase's free-tier storage would hold committee
-- documents fine, but its shared egress cap is the real constraint (the app
-- already hit that once from an unrelated bug), so Drive stays the actual
-- file store and this table just links to it.
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  title text not null,
  url text not null check (url ~* '^https://(drive|docs)\.google\.com/'),
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Attaches a document (a Google Drive link) to a room -- optionally one of
-- its topics -- a task, or a decision. Never a private chat. A document can
-- be attached to several things, so this is its own table.
create table public.document_links (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  space_id uuid references public.spaces(id) on delete cascade,
  topic_id uuid references public.space_topics(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  decision_id uuid references public.decisions(id) on delete cascade,
  linked_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  -- exactly one kind of target (a topic only ever comes with its room)
  constraint document_links_one_target check (
    (space_id is not null and task_id is null and decision_id is null)
    or (space_id is null and topic_id is null and task_id is not null and decision_id is null)
    or (space_id is null and topic_id is null and task_id is null and decision_id is not null)
  )
);

-- The Library: a shelf of reference documents (Google Drive links) that one or
-- more groups should all have to hand -- separate from the documents attached
-- to a specific room, task or decision. Each item is shared with the groups
-- listed in library_item_groups; a member sees an item if they're in any of them.
create table public.library_items (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) > 0),
  description text,
  category text,
  url text not null check (url ~* '^https://(drive|docs)\.google\.com/'),
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.library_item_groups (
  item_id uuid not null references public.library_items(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  primary key (item_id, group_id)
);

-- ============================== helper functions ==============================
-- security definer so they can read group_members/profiles without recursive RLS checks.

create or replace function public.is_global_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_global_admin from profiles where id = auth.uid()), false);
$$;

create or replace function public.is_member_of(gid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_global_admin() or exists (
    select 1 from group_members where group_id = gid and member_id = auth.uid()
  );
$$;

create or replace function public.is_group_admin(gid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_global_admin() or exists (
    select 1 from group_members where group_id = gid and member_id = auth.uid() and is_admin = true
  );
$$;

create or replace function public.space_group(sid uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select group_id from spaces where id = sid;
$$;

create or replace function public.is_space_participant(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from space_participants where space_id = sid and member_id = auth.uid()
  );
$$;

-- Whether the signed-in member can see a room at all: group membership for a
-- 'group' room, the explicit participant list for a 'private' one. This
-- deliberately does NOT fall back to is_global_admin() for private rooms --
-- being global admin doesn't grant a backdoor into someone else's DM.
create or replace function public.can_see_space(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case when s.visibility = 'private'
    then public.is_space_participant(s.id)
    else public.is_member_of(s.group_id)
  end
  from spaces s where s.id = sid;
$$;

-- Used only by space_participants_insert. A raw subquery there against
-- `spaces` would be subject to spaces' OWN select policy (can_see_space),
-- which for a brand-new private room is a chicken-and-egg problem: you can't
-- see it until you're a participant, and you can't become a participant
-- without an insert whose check needs to see it first. This bypasses that.
create or replace function public.created_space(sid uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select created_by from spaces where id = sid;
$$;

create or replace function public.decision_group(did uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select group_id from decisions where id = did;
$$;

create or replace function public.task_group(tid uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select group_id from tasks where id = tid;
$$;

create or replace function public.document_group(did uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select group_id from documents where id = did;
$$;

-- Library access. security definer so the checks can read library_item_groups
-- without recursing through its own policies.
create or replace function public.library_item_adder(iid uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select added_by from library_items where id = iid;
$$;

-- Visible to anyone in a group the item is shared with, and always to whoever
-- added it (so they can see it between creating it and sharing it).
create or replace function public.library_item_visible(iid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from library_item_groups g where g.item_id = iid and public.is_member_of(g.group_id)
  ) or coalesce((select added_by = auth.uid() from library_items where id = iid), false);
$$;

-- Editable/removable by whoever added it, or an admin of any group it's shared with.
create or replace function public.library_item_managed(iid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_global_admin()
    or coalesce((select added_by = auth.uid() from library_items where id = iid), false)
    or exists (
      select 1 from library_item_groups g where g.item_id = iid and public.is_group_admin(g.group_id)
    );
$$;

-- A document may only be attached to something in the same group, and never
-- to a private chat (those have no group and aren't for shared documents).
create or replace function public.document_link_target_ok(
  doc uuid, sp uuid, tp uuid, tk uuid, dc uuid
)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    public.document_group(doc) = case
      when sp is not null then (select group_id from spaces where id = sp and visibility = 'group')
      when tk is not null then (select group_id from tasks where id = tk)
      when dc is not null then (select group_id from decisions where id = dc)
    end
    and (tp is null or exists (select 1 from space_topics where id = tp and space_id = sp)),
    false
  );
$$;

-- ============================== new user -> profile ==============================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================== vote choice validation ==============================
-- A check constraint can't reference another table, so a custom decision's
-- vote_options list is enforced here instead, on every insert/update of a vote.

create or replace function public.validate_vote_choice()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from decisions where id = new.decision_id and new.choice = any(vote_options)
  ) then
    raise exception 'invalid vote choice "%" for this decision', new.choice;
  end if;
  return new;
end;
$$;

drop trigger if exists votes_validate_choice on votes;
create trigger votes_validate_choice
  before insert or update on votes
  for each row execute function public.validate_vote_choice();

-- ============================== quorum auto-resolution ==============================
-- Threshold-per-option: the group's quorum number applies to every option in
-- vote_options (not just yes/no) -- whichever one reaches it first wins and
-- closes the motion. "abstain" never triggers a resolution on its own. For
-- the default yes/no/abstain set this maps onto the familiar passed/failed
-- status; for a custom option set, `status` becomes 'passed' as a generic
-- "resolved" marker and `resolved_choice` records which option actually won.

create or replace function public.recompute_decision_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  d record;
  winner record;
  new_status text;
  did uuid;
begin
  did := coalesce(new.decision_id, old.decision_id);
  select * into d from decisions where id = did;
  if d is null or d.status <> 'open' then
    return coalesce(new, old);
  end if;

  select choice, count(*) as n into winner
  from votes
  where decision_id = d.id and choice = any(d.vote_options) and choice <> 'abstain'
  group by choice
  having count(*) >= d.quorum
  order by count(*) desc
  limit 1;

  if winner.choice is not null then
    new_status := case
      when winner.choice = 'yes' then 'passed'
      when winner.choice = 'no' then 'failed'
      else 'passed'
    end;
    update decisions
      set status = new_status, resolved_choice = winner.choice, closed_at = now()
      where id = d.id;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists votes_recompute_status on votes;
create trigger votes_recompute_status
  after insert or update or delete on votes
  for each row execute function public.recompute_decision_status();

create or replace function public.touch_space_last_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update spaces set last_message_at = new.created_at, last_message_by = new.author_id
    where id = new.space_id;
  return new;
end;
$$;

drop trigger if exists messages_touch_space on messages;
create trigger messages_touch_space
  after insert on messages
  for each row execute function public.touch_space_last_message();

-- A pushed-back due date or a reassignment should get its own fresh
-- reminder, not stay silent because the old due date already sent one.
create or replace function public.reset_task_reminder_flags()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.due_date is distinct from old.due_date or new.assignee_id is distinct from old.assignee_id then
    new.due_reminder_sent := false;
    new.overdue_notified := false;
  end if;
  return new;
end;
$$;

-- A message's author can reword it, but nothing else about it: which room it
-- is in, who wrote it and when are pinned, and edited_at is stamped here so
-- the client can't fake or hide an edit.
create or replace function public.stamp_message_edit()
returns trigger language plpgsql as $$
begin
  new.space_id := old.space_id;
  new.topic_id := old.topic_id;
  new.author_id := old.author_id;
  new.created_at := old.created_at;
  if new.text is distinct from old.text then
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;
  return new;
end;
$$;

-- Renaming a topic must not move it to another room or change who made it.
create or replace function public.pin_topic_fields()
returns trigger language plpgsql as $$
begin
  new.space_id := old.space_id;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists space_topics_pin_fields on space_topics;
create trigger space_topics_pin_fields
  before update on space_topics
  for each row execute function public.pin_topic_fields();

drop trigger if exists messages_stamp_edit on messages;
create trigger messages_stamp_edit
  before update on messages
  for each row execute function public.stamp_message_edit();

-- Once anyone has voted, a motion's wording is locked -- otherwise the text
-- people voted on could be changed underneath them.
create or replace function public.guard_decision_text_edit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.title is distinct from old.title or new.motion_text is distinct from old.motion_text)
     and exists (select 1 from votes where decision_id = old.id) then
    raise exception 'This motion already has votes, so its wording can no longer be changed';
  end if;
  return new;
end;
$$;

-- Only an open motion's deadline can be moved, and moving it re-arms the
-- "deadline tomorrow" reminder (reminder_sent) so it fires for the new date.
create or replace function public.guard_decision_deadline_edit()
returns trigger language plpgsql as $$
begin
  if new.deadline is distinct from old.deadline then
    if old.status <> 'open' then
      raise exception 'This motion has already closed, so its deadline can no longer be changed';
    end if;
    new.reminder_sent := false;
  end if;
  return new;
end;
$$;

drop trigger if exists decisions_guard_deadline_edit on decisions;
create trigger decisions_guard_deadline_edit
  before update on decisions
  for each row execute function public.guard_decision_deadline_edit();

drop trigger if exists decisions_guard_text_edit on decisions;
create trigger decisions_guard_text_edit
  before update on decisions
  for each row execute function public.guard_decision_text_edit();

drop trigger if exists tasks_reset_reminder_flags on tasks;
create trigger tasks_reset_reminder_flags
  before update on tasks
  for each row execute function public.reset_task_reminder_flags();

-- Adding or removing someone also re-arms the task's reminders, so whoever
-- is responsible now gets told, same as when the due date moves.
create or replace function public.reset_task_flags_on_assignee_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update tasks set due_reminder_sent = false, overdue_notified = false
    where id = coalesce(new.task_id, old.task_id);
  return null;
end;
$$;

drop trigger if exists task_assignees_reset_flags on task_assignees;
create trigger task_assignees_reset_flags
  after insert or delete on task_assignees
  for each row execute function public.reset_task_flags_on_assignee_change();

-- ============================== row level security ==============================

alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.member_skills enable row level security;
alter table public.member_roles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.spaces enable row level security;
alter table public.space_participants enable row level security;
alter table public.messages enable row level security;
alter table public.space_topics enable row level security;
alter table public.space_reads enable row level security;
alter table public.notifications enable row level security;
alter table public.decisions enable row level security;
alter table public.votes enable row level security;
alter table public.tasks enable row level security;
alter table public.task_skill_tags enable row level security;
alter table public.task_assignees enable row level security;
alter table public.skill_areas enable row level security;
alter table public.documents enable row level security;
alter table public.document_links enable row level security;
alter table public.library_items enable row level security;
alter table public.library_item_groups enable row level security;
alter table public.meetings enable row level security;

-- skill_areas: readable by any signed-in member, editable by global admins
create policy "skill_areas_select" on public.skill_areas for select using (auth.role() = 'authenticated');
create policy "skill_areas_write" on public.skill_areas for all using (public.is_global_admin()) with check (public.is_global_admin());

-- roles: readable by any signed-in member, editable by global admins
create policy "roles_select" on public.roles for select using (auth.role() = 'authenticated');
create policy "roles_write" on public.roles for all using (public.is_global_admin()) with check (public.is_global_admin());

-- profiles: every signed-in member can see everyone (names/avatars are shown app-wide);
-- a member can edit their own row, a global admin can edit anyone's.
create policy "profiles_select" on public.profiles for select using (auth.role() = 'authenticated');
create policy "profiles_update" on public.profiles for update
  using (id = auth.uid() or public.is_global_admin())
  with check (id = auth.uid() or public.is_global_admin());
create policy "profiles_admin_write" on public.profiles for insert with check (public.is_global_admin());
create policy "profiles_admin_delete" on public.profiles for delete using (public.is_global_admin());

-- member_skills: visible to all signed-in members; editable by the member themself or a global admin
create policy "member_skills_select" on public.member_skills for select using (auth.role() = 'authenticated');
create policy "member_skills_write" on public.member_skills for all
  using (member_id = auth.uid() or public.is_global_admin())
  with check (member_id = auth.uid() or public.is_global_admin());

-- member_roles: visible to all signed-in members; a member's committee
-- role(s) are assigned by a global admin, not self-service.
create policy "member_roles_select" on public.member_roles for select using (auth.role() = 'authenticated');
create policy "member_roles_write" on public.member_roles for all
  using (public.is_global_admin()) with check (public.is_global_admin());

-- groups: visible only to members of that group (or global admins); managed by global admins
create policy "groups_select" on public.groups for select using (public.is_member_of(id));
create policy "groups_write" on public.groups for all using (public.is_global_admin()) with check (public.is_global_admin());

-- group_members: visible to members of the group; managed by that group's admins
create policy "group_members_select" on public.group_members for select using (public.is_member_of(group_id));
create policy "group_members_write" on public.group_members for all
  using (public.is_group_admin(group_id))
  with check (public.is_group_admin(group_id));

-- spaces
create policy "spaces_select" on public.spaces for select using (public.can_see_space(id));
create policy "spaces_insert" on public.spaces for insert with check (
  (visibility = 'group' and public.is_member_of(group_id))
  or (visibility = 'private' and created_by = auth.uid())
);
create policy "spaces_update" on public.spaces for update
  using (public.is_group_admin(group_id) or created_by = auth.uid())
  with check (public.is_group_admin(group_id) or created_by = auth.uid());
create policy "spaces_delete" on public.spaces for delete
  using (public.is_group_admin(group_id) or (group_id is null and created_by = auth.uid()));

-- space_participants: only visible/manageable by people who can already see
-- that room; only the room's creator can add participants (done once, right
-- after creating the room -- there's no "add someone to my DM" flow).
create policy "space_participants_select" on public.space_participants for select
  using (public.can_see_space(space_id));
create policy "space_participants_insert" on public.space_participants for insert
  with check (
    public.created_space(space_id) = auth.uid()
  );

-- messages
create policy "messages_select" on public.messages for select using (public.can_see_space(space_id));
create policy "messages_insert" on public.messages for insert
  with check (
    public.can_see_space(space_id)
    and author_id = auth.uid()
    and (topic_id is null or exists (
      select 1 from public.space_topics t where t.id = topic_id and t.space_id = messages.space_id
    ))
  );
create policy "messages_update" on public.messages for update
  using (author_id = auth.uid())
  with check (author_id = auth.uid() and public.can_see_space(space_id));
create policy "messages_delete" on public.messages for delete
  using (
    author_id = auth.uid()
    or (public.space_group(space_id) is not null and public.is_group_admin(public.space_group(space_id)))
  );

-- space_topics: anyone in the room can see and add topics; a topic's creator
-- or a group admin can rename it, and can delete it only while it's empty
-- (so a topic made by mistake can go, but a conversation can't be wiped).
create policy "space_topics_select" on public.space_topics for select
  using (public.can_see_space(space_id));
create policy "space_topics_insert" on public.space_topics for insert
  with check (public.can_see_space(space_id) and created_by = auth.uid());
create policy "space_topics_update" on public.space_topics for update
  using (
    created_by = auth.uid()
    or (public.space_group(space_id) is not null and public.is_group_admin(public.space_group(space_id)))
  )
  with check (public.can_see_space(space_id));
create policy "space_topics_delete" on public.space_topics for delete
  using (
    (
      created_by = auth.uid()
      or (public.space_group(space_id) is not null and public.is_group_admin(public.space_group(space_id)))
    )
    and not exists (select 1 from public.messages m where m.topic_id = space_topics.id)
  );

-- space_reads: everyone who can see a room can see who's read it (lets a
-- future "seen by" UI work), but can only ever write their own read state.
create policy "space_reads_select" on public.space_reads for select
  using (public.can_see_space(space_id));
create policy "space_reads_write" on public.space_reads for all
  using (member_id = auth.uid() and public.can_see_space(space_id))
  with check (member_id = auth.uid() and public.can_see_space(space_id));

-- notifications: strictly private to the member they're addressed to.
-- Inserted only by server routes using the service-role key (bypasses RLS),
-- never directly by a client.
create policy "notifications_select" on public.notifications for select using (member_id = auth.uid());
create policy "notifications_update" on public.notifications for update
  using (member_id = auth.uid()) with check (member_id = auth.uid());

-- decisions
create policy "decisions_select" on public.decisions for select using (public.is_member_of(group_id));
create policy "decisions_insert" on public.decisions for insert
  with check (public.is_member_of(group_id) and proposed_by = auth.uid());
-- A motion can be deleted (e.g. created in error) by its proposer or a group
-- admin, but only while nobody has voted on it -- once there are votes it's
-- part of the record, and withdrawing is the route instead.
create policy "decisions_delete" on public.decisions for delete
  using (
    (public.is_group_admin(group_id) or proposed_by = auth.uid())
    and not exists (select 1 from public.votes v where v.decision_id = decisions.id)
  );
create policy "decisions_update" on public.decisions for update
  using (public.is_group_admin(group_id) or proposed_by = auth.uid())
  with check (public.is_group_admin(group_id) or proposed_by = auth.uid());

-- votes: a member can only cast/change/withdraw their own vote, only while the decision is open
create policy "votes_select" on public.votes for select using (public.is_member_of(public.decision_group(decision_id)));
create policy "votes_write" on public.votes for all
  using (
    member_id = auth.uid()
    and public.is_member_of(public.decision_group(decision_id))
  )
  with check (
    member_id = auth.uid()
    and public.is_member_of(public.decision_group(decision_id))
    and exists (select 1 from decisions d where d.id = decision_id and d.status = 'open')
  );

-- tasks
create policy "tasks_select" on public.tasks for select using (public.is_member_of(group_id));
create policy "tasks_insert" on public.tasks for insert with check (public.is_member_of(group_id));
create policy "tasks_update" on public.tasks for update
  using (public.is_member_of(group_id))
  with check (public.is_member_of(group_id));
create policy "tasks_delete" on public.tasks for delete
  using (public.is_group_admin(group_id) or created_by = auth.uid());

-- task_skill_tags
create policy "task_skill_tags_select" on public.task_skill_tags for select using (public.is_member_of(public.task_group(task_id)));
create policy "task_skill_tags_write" on public.task_skill_tags for all
  using (public.is_member_of(public.task_group(task_id)))
  with check (public.is_member_of(public.task_group(task_id)));

-- task_assignees: same visibility/editing as the task itself
create policy "task_assignees_select" on public.task_assignees for select using (public.is_member_of(public.task_group(task_id)));
create policy "task_assignees_write" on public.task_assignees for all
  using (public.is_member_of(public.task_group(task_id)))
  with check (public.is_member_of(public.task_group(task_id)));

-- documents: visible to the group, added by any member, removable by its
-- adder or a group admin (matches tasks_delete).
create policy "documents_select" on public.documents for select using (public.is_member_of(group_id));
create policy "documents_insert" on public.documents for insert
  with check (public.is_member_of(group_id) and added_by = auth.uid());
create policy "documents_update" on public.documents for update
  using (public.is_group_admin(group_id) or added_by = auth.uid())
  with check (public.is_group_admin(group_id) or added_by = auth.uid());
create policy "documents_delete" on public.documents for delete
  using (public.is_group_admin(group_id) or added_by = auth.uid());

-- document_links: visible to the document's group; anyone in the group can
-- attach a document to an item in that group; whoever attached it, or a
-- group admin, can detach it.
create policy "document_links_select" on public.document_links for select
  using (public.is_member_of(public.document_group(document_id)));
create policy "document_links_insert" on public.document_links for insert
  with check (
    linked_by = auth.uid()
    and public.is_member_of(public.document_group(document_id))
    and public.document_link_target_ok(document_id, space_id, topic_id, task_id, decision_id)
  );
create policy "document_links_delete" on public.document_links for delete
  using (
    linked_by = auth.uid()
    or public.is_group_admin(public.document_group(document_id))
  );

-- library: any member can add an item to the Library of groups they're in;
-- whoever added it, or an admin of a group it's shared with, can edit or
-- remove it. A member can only share to / unshare from groups they belong to.
create policy "library_items_select" on public.library_items for select
  using (public.library_item_visible(id));
create policy "library_items_insert" on public.library_items for insert
  with check (added_by = auth.uid());
create policy "library_items_update" on public.library_items for update
  using (public.library_item_managed(id))
  with check (public.library_item_managed(id));
create policy "library_items_delete" on public.library_items for delete
  using (public.library_item_managed(id));

create policy "library_item_groups_select" on public.library_item_groups for select
  using (public.is_member_of(group_id) or public.library_item_adder(item_id) = auth.uid());
create policy "library_item_groups_insert" on public.library_item_groups for insert
  with check (public.is_member_of(group_id) and public.library_item_managed(item_id));
create policy "library_item_groups_delete" on public.library_item_groups for delete
  using (public.is_member_of(group_id) and public.library_item_managed(item_id));

-- meetings: any group member can schedule/edit one (matches tasks_update);
-- removable by its creator or a group admin (matches tasks_delete).
create policy "meetings_select" on public.meetings for select using (public.is_member_of(group_id));
create policy "meetings_insert" on public.meetings for insert with check (public.is_member_of(group_id));
create policy "meetings_update" on public.meetings for update
  using (public.is_member_of(group_id))
  with check (public.is_member_of(group_id));
create policy "meetings_delete" on public.meetings for delete
  using (public.is_group_admin(group_id) or created_by = auth.uid());

-- Login log: one row per successful sign-in, written by a trigger on
-- auth.users (Supabase Auth updates last_sign_in_at on every sign-in, by PIN
-- or email link). Only a global admin can read it; nobody can write to it
-- from the app. Failed attempts aren't recorded.
create table public.login_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  email text,
  logged_at timestamptz not null default now()
);
create index login_events_logged_at_idx on public.login_events (logged_at desc);
alter table public.login_events enable row level security;
create policy "login_events_select" on public.login_events for select
  using (public.is_global_admin());

-- Must never be able to break signing in, hence the exception handler.
create or replace function public.record_login()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    insert into public.login_events (user_id, email, logged_at)
    values (new.id, new.email, coalesce(new.last_sign_in_at, now()));
  exception when others then
    null;
  end;
  return new;
end;
$$;

create trigger on_auth_user_login
  after update of last_sign_in_at on auth.users
  for each row
  when (new.last_sign_in_at is distinct from old.last_sign_in_at)
  execute function public.record_login();

-- ============================== realtime ==============================

alter publication supabase_realtime add table
  public.profiles, public.roles, public.member_roles, public.groups, public.group_members,
  public.spaces, public.space_participants, public.messages, public.decisions, public.votes,
  public.tasks, public.task_skill_tags, public.member_skills, public.space_reads,
  public.notifications, public.documents, public.meetings, public.task_assignees, public.space_topics, public.document_links,
  public.library_items, public.library_item_groups;

-- ============================== seed reference data ==============================
-- Skill areas and roles are shared UI reference data, not committee-specific —
-- safe to seed directly. Roles can be added to later from the Admin tab.

insert into public.skill_areas (id, label, sort_order) values
  ('rules', 'Rules & Regulations', 1),
  ('events', 'Events & Championships', 2),
  ('media', 'Media & Communications', 3),
  ('membership', 'Membership & Applications', 4),
  ('sponsorship', 'Sponsorship & Fundraising', 5),
  ('welfare', 'Welfare & Conduct', 6),
  ('it', 'IT & Digital', 7),
  ('judging', 'Judging', 8),
  ('awards', 'Awards & Recognition', 9),
  ('finance', 'Finance & Admin', 10)
on conflict (id) do nothing;

insert into public.roles (label, sort_order) values
  ('Chairperson', 1),
  ('Vice Chair', 2),
  ('Secretary', 3),
  ('Treasurer', 4),
  ('Committee Member', 5),
  ('Membership Secretary', 6),
  ('Media Team', 7),
  ('Judges Board', 8),
  ('Awards Secretary', 9),
  ('Show Secretary', 10),
  ('Complaints Officer', 11)
on conflict (label) do nothing;

-- ============================== bootstrap note ==============================
-- After you sign in for the first time (via the app's magic-link login), run:
--   update public.profiles set is_global_admin = true where email = 'you@example.com';
-- That makes you the first admin, who can then invite the rest of the committee
-- and create groups from the Admin tab.
