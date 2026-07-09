create table if not exists commercial.operator_tier (
  id uuid primary key default gen_random_uuid(),
  tier_key text not null unique,
  display_name text not null,
  min_routes integer null,
  max_routes integer null,
  implementation_fee numeric(10,2) null,
  weekly_subscription numeric(10,2) null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists operator_tier_touch_updated_at on commercial.operator_tier;

create trigger operator_tier_touch_updated_at
before update on commercial.operator_tier
for each row
execute function commercial.touch_updated_at();

insert into commercial.operator_tier (
  tier_key, display_name, min_routes, max_routes,
  implementation_fee, weekly_subscription, sort_order
)
values
('operator_1','Operator 1 (1–10 Routes)',1,10,118,59,10),
('operator_2','Operator 2 (11–15 Routes)',11,15,198,99,20),
('operator_3','Operator 3 (16–25 Routes)',16,25,398,199,30),
('operator_4','Operator 4 (26–50 Routes)',26,50,698,349,40),
('operator_5','Operator 5 (51+ Routes)',51,null,null,null,50)
on conflict (tier_key) do update
set
  display_name = excluded.display_name,
  min_routes = excluded.min_routes,
  max_routes = excluded.max_routes,
  implementation_fee = excluded.implementation_fee,
  weekly_subscription = excluded.weekly_subscription,
  sort_order = excluded.sort_order,
  active = true;

alter table commercial.operator_tier enable row level security;

create policy operator_tier_select
on commercial.operator_tier
for select
using (auth.role() = 'authenticated');
