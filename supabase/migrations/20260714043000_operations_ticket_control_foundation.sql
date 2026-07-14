create table if not exists core.operations_ticket_template (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique,
  template_name text not null,
  ticket_family text not null,
  execution_lane text not null,
  description text,
  default_priority integer not null default 100,
  default_collection_mode text,
  default_manifest_types text[] not null default array[]::text[],
  default_skip_combined boolean not null default true,
  default_payload_json jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint operations_ticket_template_family_chk check (
    ticket_family = any (array['manifest', 'report', 'sweep', 'system'])
  ),

  constraint operations_ticket_template_execution_lane_chk check (
    execution_lane = any (array[
      'operations_manifest_capture_plan',
      'operations_collection_request'
    ])
  ),

  constraint operations_ticket_template_priority_chk check (
    default_priority between 1 and 999
  )
);

create table if not exists core.company_operations_ticket_assignment (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  template_id uuid not null references core.operations_ticket_template(id) on delete cascade,
  assignment_status text not null default 'draft',
  is_enabled boolean not null default false,
  generation_mode text not null default 'manual',
  cadence_minutes integer,
  window_preset text not null default 'OFF',
  start_time time without time zone,
  end_time time without time zone,
  priority_override integer,
  route_scope text not null default 'selected_routes',
  route_limit integer,
  assignment_payload_json jsonb not null default '{}'::jsonb,
  last_generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint company_operations_ticket_assignment_unique unique (
    company_id,
    template_id
  ),

  constraint company_operations_ticket_assignment_status_chk check (
    assignment_status = any (array['draft', 'ready', 'active', 'paused', 'retired'])
  ),

  constraint company_operations_ticket_assignment_generation_mode_chk check (
    generation_mode = any (array['manual', 'scheduled', 'event_triggered'])
  ),

  constraint company_operations_ticket_assignment_window_chk check (
    window_preset = any (array['SORT_DELIVERY_DAY', 'BUSINESS_DAY', 'CUSTOM', 'OFF'])
  ),

  constraint company_operations_ticket_assignment_route_scope_chk check (
    route_scope = any (array[
      'selected_routes',
      'active_routes',
      'full_active_route_set',
      'route_batch'
    ])
  ),

  constraint company_operations_ticket_assignment_cadence_chk check (
    cadence_minutes is null or cadence_minutes = any (array[15, 30, 60])
  ),

  constraint company_operations_ticket_assignment_priority_chk check (
    priority_override is null or priority_override between 1 and 999
  ),

  constraint company_operations_ticket_assignment_route_limit_chk check (
    route_limit is null or route_limit > 0
  )
);

create index if not exists operations_ticket_template_key_idx
  on core.operations_ticket_template (template_key);

create index if not exists operations_ticket_template_active_idx
  on core.operations_ticket_template (is_active, ticket_family, execution_lane);

create index if not exists company_operations_ticket_assignment_company_idx
  on core.company_operations_ticket_assignment (company_id, assignment_status, is_enabled);

create index if not exists company_operations_ticket_assignment_template_idx
  on core.company_operations_ticket_assignment (template_id, assignment_status, is_enabled);

create or replace view public.operations_ticket_template_v
with (security_invoker = true) as
select
  id,
  template_key,
  template_name,
  ticket_family,
  execution_lane,
  description,
  default_priority,
  default_collection_mode,
  default_manifest_types,
  default_skip_combined,
  default_payload_json,
  is_active,
  created_at,
  updated_at
from core.operations_ticket_template;

create or replace view public.company_operations_ticket_assignment_v
with (security_invoker = true) as
select
  a.id,
  a.company_id,
  c.company_slug,
  a.template_id,
  t.template_key,
  t.template_name,
  t.ticket_family,
  t.execution_lane,
  a.assignment_status,
  a.is_enabled,
  a.generation_mode,
  a.cadence_minutes,
  a.window_preset,
  a.start_time,
  a.end_time,
  a.priority_override,
  coalesce(a.priority_override, t.default_priority) as effective_priority,
  a.route_scope,
  a.route_limit,
  a.assignment_payload_json,
  a.last_generated_at,
  a.created_at,
  a.updated_at
from core.company_operations_ticket_assignment a
join core.companies c on c.id = a.company_id
join core.operations_ticket_template t on t.id = a.template_id;

insert into core.operations_ticket_template (
  template_key,
  template_name,
  ticket_family,
  execution_lane,
  description,
  default_priority,
  default_collection_mode,
  default_manifest_types,
  default_skip_combined,
  default_payload_json,
  is_active,
  updated_at
)
values (
  'MANIFEST_ROUTE_CAPTURE',
  'Manifest Route Capture',
  'manifest',
  'operations_manifest_capture_plan',
  'Capture delivery and pickup manifests for selected or active routes through the machine-native manifest execution lane.',
  100,
  'route_selective',
  array['delivery', 'pickup'],
  true,
  jsonb_build_object(
    'runner_goal', 'capture_route_manifests',
    'collect_scope', 'route_manifests',
    'manifest_types', jsonb_build_array('delivery', 'pickup'),
    'skip_combined', true
  ),
  true,
  now()
)
on conflict (template_key)
do update set
  template_name = excluded.template_name,
  ticket_family = excluded.ticket_family,
  execution_lane = excluded.execution_lane,
  description = excluded.description,
  default_priority = excluded.default_priority,
  default_collection_mode = excluded.default_collection_mode,
  default_manifest_types = excluded.default_manifest_types,
  default_skip_combined = excluded.default_skip_combined,
  default_payload_json = excluded.default_payload_json,
  is_active = excluded.is_active,
  updated_at = now();

alter table core.operations_ticket_template enable row level security;
alter table core.company_operations_ticket_assignment enable row level security;

create policy operations_ticket_template_select_authenticated
  on core.operations_ticket_template
  for select
  to authenticated
  using (is_active = true or core.is_platform_owner());

create policy operations_ticket_template_insert_platform_owner
  on core.operations_ticket_template
  for insert
  to authenticated
  with check (core.is_platform_owner());

create policy operations_ticket_template_update_platform_owner
  on core.operations_ticket_template
  for update
  to authenticated
  using (core.is_platform_owner())
  with check (core.is_platform_owner());

create policy company_operations_ticket_assignment_select_access
  on core.company_operations_ticket_assignment
  for select
  to authenticated
  using (core.is_platform_owner() or core.can_access_company(company_id));

create policy company_operations_ticket_assignment_insert_platform_owner
  on core.company_operations_ticket_assignment
  for insert
  to authenticated
  with check (core.is_platform_owner());

create policy company_operations_ticket_assignment_update_platform_owner
  on core.company_operations_ticket_assignment
  for update
  to authenticated
  using (core.is_platform_owner())
  with check (core.is_platform_owner());

grant select on table core.operations_ticket_template to authenticated;
grant select on table core.company_operations_ticket_assignment to authenticated;

grant all on table core.operations_ticket_template to service_role;
grant all on table core.company_operations_ticket_assignment to service_role;

grant all on table public.operations_ticket_template_v to authenticated;
grant all on table public.company_operations_ticket_assignment_v to authenticated;

grant all on table public.operations_ticket_template_v to service_role;
grant all on table public.company_operations_ticket_assignment_v to service_role;
