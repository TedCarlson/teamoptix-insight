create table if not exists core.driver_activity_event_type (
  event_type text primary key,
  event_family text not null,
  event_owner text not null,
  description text not null,
  is_driver_action boolean not null default false,
  is_system_action boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into core.driver_activity_event_type (
  event_type, event_family, event_owner, description, is_driver_action, is_system_action
)
values
  ('CLOCK_IN', 'TIMEKEEPING', 'DRIVER', 'Driver clocked in for the workday.', true, false),
  ('CLOCK_OUT', 'TIMEKEEPING', 'DRIVER', 'Driver clocked out for the workday.', true, false),
  ('LUNCH_START', 'TIMEKEEPING', 'DRIVER', 'Driver started lunch.', true, false),
  ('LUNCH_END', 'TIMEKEEPING', 'DRIVER', 'Driver ended lunch.', true, false),
  ('BREAK_START', 'TIMEKEEPING', 'DRIVER', 'Driver started break.', true, false),
  ('BREAK_END', 'TIMEKEEPING', 'DRIVER', 'Driver ended break.', true, false),
  ('WORKDAY_NOTE', 'TIMEKEEPING', 'DRIVER', 'Driver submitted a workday note.', true, false),
  ('TRACKING_STARTED', 'BREADCRUMB', 'SYSTEM', 'Breadcrumb tracking started.', false, true),
  ('TRACKING_PAUSED', 'BREADCRUMB', 'SYSTEM', 'Breadcrumb tracking paused.', false, true),
  ('TRACKING_STOPPED', 'BREADCRUMB', 'SYSTEM', 'Breadcrumb tracking stopped.', false, true),
  ('TERMINAL_GEOFENCE_ENTERED', 'PRESENCE', 'SYSTEM', 'Driver device entered terminal geofence.', false, true),
  ('TERMINAL_GEOFENCE_EXITED', 'PRESENCE', 'SYSTEM', 'Driver device exited terminal geofence.', false, true),
  ('LIKELY_SHIFT_ARRIVAL', 'PRESENCE', 'SYSTEM', 'Breadcrumb suggests likely shift arrival.', false, true),
  ('LIKELY_ROUTE_RETURN', 'PRESENCE', 'SYSTEM', 'Breadcrumb suggests likely route return.', false, true)
on conflict (event_type) do update set
  event_family = excluded.event_family,
  event_owner = excluded.event_owner,
  description = excluded.description,
  is_driver_action = excluded.is_driver_action,
  is_system_action = excluded.is_system_action,
  is_active = true;

create table if not exists core.driver_activity_event (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  profile_id uuid null references core.profiles(id) on delete set null,
  person_id uuid null,
  roster_member_id uuid null references core.company_roster(id) on delete set null,
  service_date date not null,
  event_type text not null references core.driver_activity_event_type(event_type),
  occurred_at timestamptz not null default now(),
  device_occurred_at timestamptz null,
  source text not null default 'DRIVER_WEB',
  event_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists driver_activity_event_company_date_idx
  on core.driver_activity_event(company_id, service_date, occurred_at);

create index if not exists driver_activity_event_roster_date_idx
  on core.driver_activity_event(roster_member_id, service_date, occurred_at);

create table if not exists core.driver_breadcrumb_point (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  profile_id uuid null references core.profiles(id) on delete set null,
  person_id uuid null,
  roster_member_id uuid null references core.company_roster(id) on delete set null,
  service_date date not null,
  captured_at timestamptz not null default now(),
  device_captured_at timestamptz null,
  latitude numeric(10,7) not null,
  longitude numeric(10,7) not null,
  accuracy_meters numeric(10,2) null,
  source text not null default 'DRIVER_WEB',
  tracking_context text not null default 'SCHEDULED_WORK_WINDOW',
  source_activity_event_id uuid null references core.driver_activity_event(id) on delete set null,
  breadcrumb_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists driver_breadcrumb_company_date_idx
  on core.driver_breadcrumb_point(company_id, service_date, captured_at);

create index if not exists driver_breadcrumb_roster_date_idx
  on core.driver_breadcrumb_point(roster_member_id, service_date, captured_at);

create table if not exists core.driver_activity_signal (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  profile_id uuid null references core.profiles(id) on delete set null,
  person_id uuid null,
  roster_member_id uuid null references core.company_roster(id) on delete set null,
  service_date date not null,
  signal_type text not null,
  occurred_at timestamptz not null default now(),
  confidence text not null default 'MEDIUM',
  source text not null default 'INSIGHT',
  source_activity_event_id uuid null references core.driver_activity_event(id) on delete set null,
  source_breadcrumb_id uuid null references core.driver_breadcrumb_point(id) on delete set null,
  signal_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists driver_activity_signal_company_date_idx
  on core.driver_activity_signal(company_id, service_date, occurred_at);

create index if not exists driver_activity_signal_roster_date_idx
  on core.driver_activity_signal(roster_member_id, service_date, occurred_at);

create or replace view public.driver_activity_event_type_v as
select * from core.driver_activity_event_type;

create or replace view public.driver_activity_event_v as
select * from core.driver_activity_event;

create or replace view public.driver_breadcrumb_point_v as
select * from core.driver_breadcrumb_point;

create or replace view public.driver_activity_signal_v as
select * from core.driver_activity_signal;
