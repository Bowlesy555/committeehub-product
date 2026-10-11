-- Push notifications to phones and computers.
-- Run once on a database that already has the earlier migrations.
--
-- After running it, the setup command (scripts/setup-customer.mjs) records
-- this deployment's address and notification keys; until then nothing is
-- sent and the app simply says notifications aren't set up yet.

-- Lets the database call the app when something happens.
create extension if not exists pg_net with schema extensions;

-- Each row is one phone/computer a member has switched notifications on for.
-- Only the owner can see, change or remove their rows; adding goes through
-- save_push_subscription() so a shared device can be handed to another member.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  -- the optional extra: alert me to new messages in rooms and chats
  notify_messages boolean not null default false,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "push_subscriptions_select" on public.push_subscriptions;
create policy "push_subscriptions_select" on public.push_subscriptions for select using (member_id = auth.uid());
drop policy if exists "push_subscriptions_update" on public.push_subscriptions;
create policy "push_subscriptions_update" on public.push_subscriptions for update
  using (member_id = auth.uid()) with check (member_id = auth.uid());
drop policy if exists "push_subscriptions_delete" on public.push_subscriptions;
create policy "push_subscriptions_delete" on public.push_subscriptions for delete using (member_id = auth.uid());

-- A deployment can keep notifications to global admins only, by setting
-- app_settings 'push_admins_only' to 'true'. The public demos do, so a
-- visitor signed in as the guest can't register their phone.
create or replace function public.push_allowed()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_global_admin() or not exists (
    select 1 from app_settings where key = 'push_admins_only' and value = 'true'
  );
$$;
revoke execute on function public.push_allowed() from public, anon;
grant execute on function public.push_allowed() to authenticated;

create or replace function public.save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth_key text, p_user_agent text
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if not public.push_allowed() then
    raise exception 'Notifications are switched off for this account';
  end if;
  insert into push_subscriptions (member_id, endpoint, p256dh, auth_key, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth_key, p_user_agent)
  on conflict (endpoint) do update
    set notify_messages = case when push_subscriptions.member_id = auth.uid()
                               then push_subscriptions.notify_messages else false end,
        member_id = auth.uid(),
        p256dh = excluded.p256dh,
        auth_key = excluded.auth_key,
        user_agent = excluded.user_agent;
end;
$$;
revoke execute on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

-- Secrets only the database and the server may read: row security on, no
-- policies, so no signed-in member can see them (unlike app_settings).
create table if not exists public.app_secrets (
  key text primary key,
  value text not null
);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;
insert into public.app_secrets (key, value)
values ('push_webhook_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

-- Tells the app about a new message / motion / task assignment / notification
-- so it can send the push. It needs app_settings 'app_url' (this deployment's
-- address, set by the setup command); with none, it does nothing.
-- Asynchronous (pg_net) and wrapped so that a problem here can never stop the
-- original insert.
create or replace function public.push_event()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  base text;
  sec text;
  payload jsonb;
begin
  begin
    select value into base from app_settings where key = 'app_url';
    select value into sec from app_secrets where key = 'push_webhook_secret';
    if base is null or sec is null then
      return new;
    end if;
    if tg_argv[0] = 'task_assigned' then
      payload := jsonb_build_object('type', 'task_assigned', 'task_id', new.task_id, 'member_id', new.member_id);
    else
      payload := jsonb_build_object('type', tg_argv[0], 'id', new.id);
    end if;
    perform net.http_post(
      url := rtrim(base, '/') || '/api/push/event',
      body := payload,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', sec)
    );
  exception when others then
    null;
  end;
  return new;
end;
$$;

drop trigger if exists push_on_message on public.messages;
create trigger push_on_message after insert on public.messages
  for each row execute function public.push_event('message');
drop trigger if exists push_on_decision on public.decisions;
create trigger push_on_decision after insert on public.decisions
  for each row execute function public.push_event('decision');
drop trigger if exists push_on_task_assignee on public.task_assignees;
create trigger push_on_task_assignee after insert on public.task_assignees
  for each row execute function public.push_event('task_assigned');
drop trigger if exists push_on_notification on public.notifications;
create trigger push_on_notification after insert on public.notifications
  for each row execute function public.push_event('notification');
