-- Default reference data for a new committee. Safe to re-run: existing rows
-- are left alone. A committee with its own lists replaces these at setup
-- time; roles can also be edited later from the Admin tab.

insert into public.skill_areas (id, label, sort_order) values
  ('governance', 'Governance & Rules', 1),
  ('finance', 'Finance & Admin', 2),
  ('events', 'Events', 3),
  ('communications', 'Communications & Media', 4),
  ('membership', 'Membership', 5),
  ('fundraising', 'Fundraising & Sponsorship', 6),
  ('welfare', 'Welfare & Conduct', 7),
  ('it', 'IT & Digital', 8)
on conflict (id) do nothing;

insert into public.roles (label, sort_order) values
  ('Chairperson', 1),
  ('Vice Chair', 2),
  ('Secretary', 3),
  ('Treasurer', 4),
  ('Committee Member', 5)
on conflict (label) do nothing;
