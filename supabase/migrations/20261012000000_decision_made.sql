-- "Decision made": a step between voting and filing a motion.
-- Run once on a database that already has the earlier migrations.
--
-- Reaching quorum no longer passes or fails a motion by itself. It moves to
-- "decision_made" and tells its proposer, who then chooses: add a task for the
-- result, extend the deadline to wait for the rest of the team, or close and
-- file it (which is what sets passed/failed). Voting is closed while it waits.
alter table public.decisions drop constraint if exists decisions_status_check;
alter table public.decisions add constraint decisions_status_check
  check (status in ('open', 'decision_made', 'passed', 'failed', 'withdrawn'));
alter table public.decisions add column if not exists hold_for_all boolean not null default false;
alter table public.decisions add column if not exists made_at timestamptz;

create or replace function public.recompute_decision_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  d record;
  winner record;
  pending int;
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
    -- A motion extended to wait for the rest of the team only moves on once
    -- everyone in the group has voted (or its deadline arrives).
    if d.hold_for_all then
      select count(*) into pending
      from group_members gm
      join profiles p on p.id = gm.member_id
      where gm.group_id = d.group_id and p.active
        and not exists (select 1 from votes v where v.decision_id = d.id and v.member_id = gm.member_id);
      if pending > 0 then
        return coalesce(new, old);
      end if;
    end if;
    update decisions
      set status = 'decision_made', resolved_choice = winner.choice, made_at = now()
      where id = d.id;
  end if;

  return coalesce(new, old);
end;
$$;

-- Re-opening a "decision made" or a filed (passed/failed) motion with a new
-- deadline is allowed; changing the deadline of a withdrawn one still isn't.
create or replace function public.guard_decision_deadline_edit()
returns trigger language plpgsql as $$
begin
  if new.deadline is distinct from old.deadline then
    if old.status <> 'open' and not (old.status in ('decision_made', 'passed', 'failed') and new.status = 'open') then
      raise exception 'This motion has already closed, so its deadline can no longer be changed';
    end if;
    new.reminder_sent := false;
  end if;
  return new;
end;
$$;

-- Tells the members who haven't voted yet that a motion is open again.
create or replace function public.notify_decision_reopened(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d record;
begin
  select * into d from decisions where id = p_id;
  if d is null then
    return;
  end if;
  insert into notifications (member_id, kind, title, body, decision_id)
  select gm.member_id, 'decision_reminder',
         'Motion reopened — your vote is needed: ' || d.title,
         'Voting is open until ' || to_char(d.deadline at time zone 'Europe/London', 'DD Mon HH24:MI'),
         d.id
  from group_members gm
  join profiles p on p.id = gm.member_id
  where gm.group_id = d.group_id and p.active
    and gm.member_id is distinct from auth.uid()
    and not exists (select 1 from votes v where v.decision_id = d.id and v.member_id = gm.member_id);
end;
$$;

create or replace function public.extend_decision(p_id uuid, p_deadline timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare d record;
begin
  select * into d from decisions where id = p_id;
  if d is null then
    raise exception 'Motion not found';
  end if;
  if not (d.proposed_by = auth.uid() or public.is_group_admin(d.group_id)) then
    raise exception 'Only the proposer or a group admin can do that';
  end if;
  if d.status <> 'decision_made' then
    raise exception 'This motion is not waiting for a decision';
  end if;
  if p_deadline is null or p_deadline <= now() then
    raise exception 'Choose a deadline in the future';
  end if;
  update decisions
    set status = 'open', deadline = p_deadline, hold_for_all = true,
        resolved_choice = null, made_at = null,
        resolution_notified = false, reminder_sent = false
    where id = p_id;
  perform public.notify_decision_reopened(p_id);
end;
$$;

-- A motion that was filed (or failed at its deadline) can be reopened with a
-- fresh deadline instead of being proposed again. Votes already cast are kept;
-- everyone who hasn't voted is told. Withdrawn motions stay withdrawn.
create or replace function public.reopen_decision(p_id uuid, p_deadline timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare d record;
begin
  select * into d from decisions where id = p_id;
  if d is null then
    raise exception 'Motion not found';
  end if;
  if not (d.proposed_by = auth.uid() or public.is_group_admin(d.group_id)) then
    raise exception 'Only the proposer or a group admin can do that';
  end if;
  if d.status not in ('passed', 'failed') then
    raise exception 'Only a finished motion can be reopened';
  end if;
  if p_deadline is null or p_deadline <= now() then
    raise exception 'Choose a deadline in the future';
  end if;
  update decisions
    set status = 'open', deadline = p_deadline, hold_for_all = true,
        resolved_choice = null, made_at = null, closed_at = null,
        resolution_notified = false, reminder_sent = false
    where id = p_id;
  perform public.notify_decision_reopened(p_id);
end;
$$;

create or replace function public.file_decision(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d record;
begin
  select * into d from decisions where id = p_id;
  if d is null then
    raise exception 'Motion not found';
  end if;
  if not (d.proposed_by = auth.uid() or public.is_group_admin(d.group_id)) then
    raise exception 'Only the proposer or a group admin can do that';
  end if;
  if d.status <> 'decision_made' then
    raise exception 'This motion is not waiting for a decision';
  end if;
  update decisions
    set status = case when d.resolved_choice = 'no' then 'failed' else 'passed' end,
        closed_at = now()
    where id = p_id;
end;
$$;

revoke execute on function public.extend_decision(uuid, timestamptz) from public, anon;
grant execute on function public.extend_decision(uuid, timestamptz) to authenticated;
revoke execute on function public.reopen_decision(uuid, timestamptz) from public, anon;
grant execute on function public.reopen_decision(uuid, timestamptz) to authenticated;
revoke execute on function public.notify_decision_reopened(uuid) from public, anon, authenticated;
revoke execute on function public.file_decision(uuid) from public, anon;
grant execute on function public.file_decision(uuid) to authenticated;
