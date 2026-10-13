-- Billing: a "paid until" date per deployment, and a lock once it has passed.
--
-- Additive and safe to re-run. With no row in public.billing (the demos, or
-- any deployment where billing hasn't been started) nothing changes and the
-- app never locks.
--
-- The row is written only by the supplier, with the service key
-- (scripts/billing.mjs). No signed-in member -- not even a global admin --
-- can read or change the table; they see it through billing_status() only.
--
--   plan         trial | annual | monthly
--   paid_until   trial: the last day of the trial
--                annual: the renewal date the next invoice is due on
--                monthly: the date the next instalment is due
--   anchor_day   monthly: the day of the month instalments fall on, kept so
--                a 31st doesn't drift to the 28th after February
--
-- Locks: trial and annual lock the day after paid_until. Monthly locks once
-- an instalment is more than 10 working days late (Mon-Fri; bank holidays
-- aren't counted, which only ever gives the committee an extra day).

create table if not exists public.billing (
  id boolean primary key default true check (id),
  plan text not null check (plan in ('trial', 'annual', 'monthly')),
  paid_until date not null,
  anchor_day smallint,
  previous_paid_until date,
  previous_plan text,
  updated_at timestamptz not null default now()
);
alter table public.billing enable row level security;
revoke all on public.billing from anon, authenticated;
grant all on public.billing to service_role;

create or replace function public.add_working_days(d date, n int)
returns date language plpgsql immutable as $$
declare
  result date := d;
  remaining int := n;
begin
  while remaining > 0 loop
    result := result + 1;
    if extract(isodow from result) < 6 then
      remaining := remaining - 1;
    end if;
  end loop;
  return result;
end;
$$;

-- The whole picture, for the server (cron) and the functions below.
--   state: none (billing not started) | ok | due (annual: invoice is out;
--          trial: always) | overdue (monthly: instalment missed) | locked
create or replace function public.billing_state()
returns jsonb language sql stable security definer set search_path = public as $$
  with b as (
    select
      plan,
      paid_until,
      case when plan = 'monthly'
        then public.add_working_days(paid_until, 10) + 1
        else paid_until + 1
      end as lock_on,
      (now() at time zone 'Europe/London')::date as today
    from billing
    where id
  )
  select coalesce(
    (
      select jsonb_build_object(
        'plan', plan,
        'paid_until', paid_until,
        'lock_on', lock_on,
        'days_left', paid_until - today,
        'state', case
          when today >= lock_on then 'locked'
          when today > paid_until then 'overdue'
          when plan = 'trial' then 'due'
          when plan = 'annual' and paid_until - today <= 30 then 'due'
          else 'ok'
        end
      )
      from b
    ),
    jsonb_build_object('state', 'none')
  );
$$;
revoke execute on function public.billing_state() from public, anon, authenticated;
grant execute on function public.billing_state() to service_role;

create or replace function public.billing_active()
returns boolean language sql stable security definer set search_path = public as $$
  select (public.billing_state() ->> 'state') is distinct from 'locked';
$$;
revoke execute on function public.billing_active() from public, anon;
grant execute on function public.billing_active() to authenticated, service_role;

-- What the app shows. Everyone learns when the system is locked; only global
-- admins see dates and reminders before that.
create or replace function public.billing_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select case
    when s ->> 'state' = 'locked' then jsonb_build_object('state', 'locked', 'plan', s -> 'plan')
    when public.is_global_admin() then s
    else jsonb_build_object('state', 'ok')
  end
  from (select public.billing_state() as s) x;
$$;
revoke execute on function public.billing_status() from public, anon;
grant execute on function public.billing_status() to authenticated;

-- The lock itself: while locked, no signed-in member can read or write any
-- table or stored file, whatever the app shows. A restrictive policy is
-- ANDed with each table's own policies, so it can only ever take access away.
-- A table added by a later migration needs the same policy; re-running this
-- block adds it.
do $$
declare
  t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity and c.relname <> 'billing'
  loop
    execute format('drop policy if exists "billing_active" on public.%I', t.relname);
    execute format(
      'create policy "billing_active" on public.%I as restrictive for all to authenticated
         using ((select public.billing_active())) with check ((select public.billing_active()))',
      t.relname
    );
  end loop;
end;
$$;

drop policy if exists "billing_active" on storage.objects;
create policy "billing_active" on storage.objects as restrictive for all to authenticated
  using ((select public.billing_active())) with check ((select public.billing_active()));
