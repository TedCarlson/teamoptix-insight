create table if not exists public.driver_time_off_request (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  roster_member_id uuid not null,
  profile_id uuid,
  requested_by_auth_user_id uuid,
  requested_dates date[] not null,
  start_date date not null,
  end_date date not null,
  day_count integer not null,
  status text not null default 'PENDING',
  request_note text,
  reviewed_by_auth_user_id uuid,
  reviewed_at timestamptz,
  manager_note text,
  schedule_override_id uuid,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_time_off_request_status_chk check (
    status in ('PENDING', 'APPROVED', 'DENIED', 'WITHDRAWN')
  ),
  constraint driver_time_off_request_day_count_chk check (
    day_count between 1 and 15
  )
);

create index if not exists driver_time_off_request_company_status_idx
  on public.driver_time_off_request(company_id, status, start_date);

create index if not exists driver_time_off_request_roster_idx
  on public.driver_time_off_request(company_id, roster_member_id, start_date);

create index if not exists driver_time_off_request_profile_idx
  on public.driver_time_off_request(company_id, profile_id, start_date);
