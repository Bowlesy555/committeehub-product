-- Seen, typing and reactions on messages (brought across from the BFA
-- version). Additive and safe to re-run.
--
-- "Seen" comes from space_reads (when each person last opened the room or
-- chat). Sharing is a switch on the person's profile and works both ways: if
-- you turn it off you stop showing your reads (and typing) and stop seeing
-- other people's. Everyone starts with it on. "Typing" uses a throwaway
-- realtime channel and stores nothing.

alter table public.profiles add column if not exists share_activity boolean not null default true;

create or replace function public.shares_activity(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select share_activity from profiles where id = uid), true);
$$;

-- Reactions on messages (a small fixed set, stored by key). Visible to anyone
-- who can see the message's room or chat; you can add and remove only your own.
create or replace function public.message_space_visible(mid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.can_see_space((select space_id from messages where id = mid)), false);
$$;

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null check (reaction in ('thumbs_up', 'heart', 'laugh', 'wow', 'thanks', 'done')),
  created_at timestamptz not null default now(),
  primary key (message_id, member_id, reaction)
);
alter table public.message_reactions enable row level security;
drop policy if exists "message_reactions_select" on public.message_reactions;
create policy "message_reactions_select" on public.message_reactions for select
  using (public.message_space_visible(message_id));
drop policy if exists "message_reactions_insert" on public.message_reactions;
create policy "message_reactions_insert" on public.message_reactions for insert
  with check (member_id = auth.uid() and public.message_space_visible(message_id));
drop policy if exists "message_reactions_delete" on public.message_reactions;
create policy "message_reactions_delete" on public.message_reactions for delete
  using (member_id = auth.uid());

-- The payment lock (see the billing migration) covers every table; a new
-- table needs it adding.
drop policy if exists "billing_active" on public.message_reactions;
create policy "billing_active" on public.message_reactions as restrictive for all to authenticated
  using ((select public.billing_active())) with check ((select public.billing_active()));

do $$
begin
  alter publication supabase_realtime add table public.message_reactions;
exception when duplicate_object then null;
end;
$$;

drop policy if exists "space_reads_select" on public.space_reads;
create policy "space_reads_select" on public.space_reads for select
  using (
    member_id = auth.uid()
    or (
      public.can_see_space(space_id)
      and public.shares_activity(member_id)
      and public.shares_activity(auth.uid())
    )
  );
