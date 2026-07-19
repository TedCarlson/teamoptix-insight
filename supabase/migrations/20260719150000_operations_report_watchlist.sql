begin;

create table if not exists core.operations_watchlist_item (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  service_date date not null,
  signal_key text not null,
  signal_type text not null,
  route_key text,
  title text not null,
  detail text not null default '',
  source_family text not null,
  source_reference text,
  severity text not null default 'WATCH',
  status text not null default 'NEW',
  resolution_class text,
  assigned_profile_id uuid references core.profiles(id) on delete set null,
  due_at timestamptz,
  resolved_at timestamptz,
  resolved_by_profile_id uuid references core.profiles(id) on delete set null,
  client_visible boolean not null default true,
  latest_signal_value numeric,
  signal_cleared_at timestamptz,
  created_by_profile_id uuid references core.profiles(id) on delete set null,
  updated_by_profile_id uuid references core.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operations_watchlist_signal_uk unique (company_id, service_date, signal_key),
  constraint operations_watchlist_severity_ck check (severity in ('INFO','WATCH','RISK','CRITICAL')),
  constraint operations_watchlist_status_ck check (status in ('NEW','ACKNOWLEDGED','IN_PROGRESS','MONITORING','RESOLVED','DISMISSED')),
  constraint operations_watchlist_resolution_ck check (
    resolution_class is null or resolution_class in (
      'SERVICE_FAILURE_CONFIRMED','CORRECTED_OPERATIONALLY','TRACKING_GAP',
      'SOURCE_DATA_ERROR','NO_ACTION_REQUIRED','ESCALATED_EXTERNALLY'
    )
  )
);

create table if not exists core.operations_watchlist_note (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  watchlist_item_id uuid not null references core.operations_watchlist_item(id) on delete cascade,
  note_type text not null default 'NOTE',
  body text not null,
  client_visible boolean not null default true,
  created_by_profile_id uuid references core.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint operations_watchlist_note_body_ck check (length(btrim(body)) > 0),
  constraint operations_watchlist_note_type_ck check (note_type in ('NOTE','ACTION','RESOLUTION','CORRECTION'))
);

create table if not exists core.operations_daily_report_share (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  service_date date not null,
  report_batch_id uuid,
  recipients text[] not null,
  subject text not null,
  message text,
  snapshot_json jsonb not null,
  provider_message_id text,
  sent_by_profile_id uuid references core.profiles(id) on delete set null,
  sent_at timestamptz not null default now(),
  constraint operations_daily_report_share_recipients_ck check (cardinality(recipients) > 0)
);

create index if not exists operations_watchlist_company_date_idx
  on core.operations_watchlist_item(company_id, service_date desc, status, severity);
create index if not exists operations_watchlist_assignee_idx
  on core.operations_watchlist_item(company_id, assigned_profile_id, status);
create index if not exists operations_watchlist_note_item_idx
  on core.operations_watchlist_note(watchlist_item_id, created_at);

drop trigger if exists operations_watchlist_item_set_updated_at on core.operations_watchlist_item;
create trigger operations_watchlist_item_set_updated_at
before update on core.operations_watchlist_item
for each row execute function core.set_updated_at();

alter table core.operations_watchlist_item enable row level security;
alter table core.operations_watchlist_note enable row level security;
alter table core.operations_daily_report_share enable row level security;

create policy operations_watchlist_item_select_access on core.operations_watchlist_item
for select to authenticated using (core.is_platform_owner() or core.can_access_company(company_id));
create policy operations_watchlist_item_insert_admin on core.operations_watchlist_item
for insert to authenticated with check (core.is_platform_owner() or core.can_admin_company(company_id));
create policy operations_watchlist_item_update_admin on core.operations_watchlist_item
for update to authenticated using (core.is_platform_owner() or core.can_admin_company(company_id))
with check (core.is_platform_owner() or core.can_admin_company(company_id));
create policy operations_watchlist_note_select_access on core.operations_watchlist_note
for select to authenticated using (core.is_platform_owner() or core.can_access_company(company_id));
create policy operations_watchlist_note_insert_admin on core.operations_watchlist_note
for insert to authenticated with check (core.is_platform_owner() or core.can_admin_company(company_id));
create policy operations_daily_report_share_select_admin on core.operations_daily_report_share
for select to authenticated using (core.is_platform_owner() or core.can_admin_company(company_id));
create policy operations_daily_report_share_insert_admin on core.operations_daily_report_share
for insert to authenticated with check (core.is_platform_owner() or core.can_admin_company(company_id));

create or replace view public.operations_watchlist_item_v
with (security_invoker = true) as
select
  item.*,
  coalesce(assignee.display_name, concat_ws(' ', assignee.first_name, assignee.last_name)) as assigned_to_name,
  coalesce(creator.display_name, concat_ws(' ', creator.first_name, creator.last_name)) as created_by_name,
  coalesce(updater.display_name, concat_ws(' ', updater.first_name, updater.last_name)) as updated_by_name
from core.operations_watchlist_item item
left join core.profiles assignee on assignee.id = item.assigned_profile_id
left join core.profiles creator on creator.id = item.created_by_profile_id
left join core.profiles updater on updater.id = item.updated_by_profile_id;

create or replace view public.operations_watchlist_note_v
with (security_invoker = true) as
select
  note.*,
  coalesce(profile.display_name, concat_ws(' ', profile.first_name, profile.last_name)) as created_by_name
from core.operations_watchlist_note note
left join core.profiles profile on profile.id = note.created_by_profile_id;

create or replace function public.upsert_company_operations_watchlist_signal(
  p_company_slug text,
  p_service_date date,
  p_signal_key text,
  p_signal_type text,
  p_title text,
  p_detail text,
  p_source_family text,
  p_severity text,
  p_signal_value numeric default null,
  p_route_key text default null,
  p_source_reference text default null
) returns uuid
language plpgsql security invoker set search_path = public, core as $$
declare
  v_company_id uuid;
  v_profile_id uuid := core.current_profile_id();
  v_id uuid;
begin
  select id into v_company_id from core.companies where company_slug = p_company_slug;
  if v_company_id is null then raise exception 'Company not found.'; end if;
  if not (core.is_platform_owner() or core.can_admin_company(v_company_id)) then raise exception 'Company admin access required.'; end if;

  insert into core.operations_watchlist_item (
    company_id, service_date, signal_key, signal_type, route_key, title, detail,
    source_family, source_reference, severity, latest_signal_value,
    created_by_profile_id, updated_by_profile_id
  ) values (
    v_company_id, p_service_date, upper(btrim(p_signal_key)), upper(btrim(p_signal_type)), nullif(btrim(p_route_key), ''),
    btrim(p_title), coalesce(btrim(p_detail), ''), upper(btrim(p_source_family)), nullif(btrim(p_source_reference), ''),
    upper(btrim(p_severity)), p_signal_value, v_profile_id, v_profile_id
  ) on conflict (company_id, service_date, signal_key) do update set
    title = excluded.title,
    detail = excluded.detail,
    route_key = excluded.route_key,
    source_family = excluded.source_family,
    source_reference = excluded.source_reference,
    severity = excluded.severity,
    latest_signal_value = excluded.latest_signal_value,
    signal_cleared_at = null,
    updated_by_profile_id = v_profile_id
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.update_company_operations_watchlist_item(
  p_company_slug text,
  p_item_id uuid,
  p_status text,
  p_assigned_profile_id uuid default null,
  p_due_at timestamptz default null,
  p_resolution_class text default null,
  p_client_visible boolean default true
) returns void
language plpgsql security invoker set search_path = public, core as $$
declare
  v_company_id uuid;
  v_profile_id uuid := core.current_profile_id();
begin
  select id into v_company_id from core.companies where company_slug = p_company_slug;
  if not (core.is_platform_owner() or core.can_admin_company(v_company_id)) then raise exception 'Company admin access required.'; end if;
  update core.operations_watchlist_item set
    status = upper(btrim(p_status)), assigned_profile_id = p_assigned_profile_id, due_at = p_due_at,
    resolution_class = nullif(upper(btrim(p_resolution_class)), ''), client_visible = p_client_visible,
    resolved_at = case when upper(btrim(p_status)) in ('RESOLVED','DISMISSED') then coalesce(resolved_at, now()) else null end,
    resolved_by_profile_id = case when upper(btrim(p_status)) in ('RESOLVED','DISMISSED') then v_profile_id else null end,
    updated_by_profile_id = v_profile_id
  where id = p_item_id and company_id = v_company_id;
  if not found then raise exception 'Watchlist item not found.'; end if;
end;
$$;

create or replace function public.add_company_operations_watchlist_note(
  p_company_slug text,
  p_item_id uuid,
  p_note_type text,
  p_body text,
  p_client_visible boolean default true
) returns uuid
language plpgsql security invoker set search_path = public, core as $$
declare
  v_company_id uuid;
  v_profile_id uuid := core.current_profile_id();
  v_id uuid;
begin
  select id into v_company_id from core.companies where company_slug = p_company_slug;
  if not (core.is_platform_owner() or core.can_admin_company(v_company_id)) then raise exception 'Company admin access required.'; end if;
  if not exists (select 1 from core.operations_watchlist_item where id = p_item_id and company_id = v_company_id) then
    raise exception 'Watchlist item not found.';
  end if;
  insert into core.operations_watchlist_note(company_id, watchlist_item_id, note_type, body, client_visible, created_by_profile_id)
  values (v_company_id, p_item_id, upper(btrim(p_note_type)), btrim(p_body), p_client_visible, v_profile_id)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.record_company_daily_report_share(
  p_company_slug text,
  p_service_date date,
  p_report_batch_id uuid,
  p_recipients text[],
  p_subject text,
  p_message text,
  p_snapshot_json jsonb,
  p_provider_message_id text
) returns uuid
language plpgsql security invoker set search_path = public, core as $$
declare
  v_company_id uuid;
  v_id uuid;
begin
  select id into v_company_id from core.companies where company_slug = p_company_slug;
  if not (core.is_platform_owner() or core.can_admin_company(v_company_id)) then raise exception 'Company admin access required.'; end if;
  insert into core.operations_daily_report_share(
    company_id, service_date, report_batch_id, recipients, subject, message,
    snapshot_json, provider_message_id, sent_by_profile_id
  ) values (
    v_company_id, p_service_date, p_report_batch_id, p_recipients, btrim(p_subject),
    nullif(btrim(p_message), ''), p_snapshot_json, p_provider_message_id, core.current_profile_id()
  ) returning id into v_id;
  return v_id;
end;
$$;

grant select on public.operations_watchlist_item_v, public.operations_watchlist_note_v to authenticated, service_role;
grant execute on function public.upsert_company_operations_watchlist_signal(text,date,text,text,text,text,text,text,numeric,text,text) to authenticated, service_role;
grant execute on function public.update_company_operations_watchlist_item(text,uuid,text,uuid,timestamptz,text,boolean) to authenticated, service_role;
grant execute on function public.add_company_operations_watchlist_note(text,uuid,text,text,boolean) to authenticated, service_role;
grant execute on function public.record_company_daily_report_share(text,date,uuid,text[],text,text,jsonb,text) to authenticated, service_role;

commit;
