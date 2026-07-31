begin;

create schema if not exists platform;

create table if not exists platform.switchboard (
  id uuid primary key default gen_random_uuid(),

  library_key text not null unique,
  display_name text not null,

  source_schema text not null,
  source_object text not null,
  object_type text not null,

  status text not null default 'DISCOVERED',
  source text not null default 'LEGACY',

  notes text,

  discovered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint platform_switchboard_library_key_format
    check (library_key ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'),

  constraint platform_switchboard_status_valid
    check (
      status in (
        'DISCOVERED',
        'DEFINED',
        'IMPLEMENTED',
        'ACTIVE',
        'RETIRED'
      )
    ),

  constraint platform_switchboard_source_valid
    check (source in ('LEGACY', 'PLATFORM')),

  constraint platform_switchboard_source_object_unique
    unique (source_schema, source_object, object_type)
);

comment on table platform.switchboard is
  'Governed Platform registry. Nothing gets added to Platform unless it first has a Switchboard record.';

create or replace function platform.touch_switchboard_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_platform_switchboard_updated_at
  on platform.switchboard;

create trigger touch_platform_switchboard_updated_at
before update on platform.switchboard
for each row
execute function platform.touch_switchboard_updated_at();

alter table platform.switchboard enable row level security;

revoke all on schema platform from public;
revoke all on platform.switchboard from public, anon, authenticated;

grant usage on schema platform to service_role;
grant all on platform.switchboard to service_role;

insert into platform.switchboard (
  library_key,
  display_name,
  source_schema,
  source_object,
  object_type,
  status,
  source,
  notes
)
select
  regexp_replace(lower(n.nspname), '[^a-z0-9]+', '_', 'g')
    || '.'
    || regexp_replace(lower(c.relname), '[^a-z0-9]+', '_', 'g'),

  initcap(replace(c.relname, '_', ' ')),

  n.nspname,
  c.relname,

  case c.relkind
    when 'r' then 'TABLE'
    when 'p' then 'PARTITIONED_TABLE'
    when 'v' then 'VIEW'
    when 'm' then 'MATERIALIZED_VIEW'
    when 'f' then 'FOREIGN_TABLE'
    else 'RELATION'
  end,

  'DISCOVERED',
  'LEGACY',

  'Discovered from the active database schema during the first Platform Switchboard inventory.'
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n
  on n.oid = c.relnamespace
where c.relkind in ('r', 'p', 'v', 'm', 'f')
  and n.nspname not in (
    'auth',
    'extensions',
    'graphql',
    'graphql_public',
    'information_schema',
    'pg_catalog',
    'pg_toast',
    'realtime',
    'storage',
    'supabase_functions',
    'supabase_migrations',
    'vault',
    'platform'
  )
  and n.nspname not like 'pg_%'
  and c.relname not like 'pg_%'
  and c.relname not like '%_backup'
  and c.relname not like '%_old'
on conflict (source_schema, source_object, object_type) do nothing;

create or replace function public.get_platform_switchboard()
returns table (
  id uuid,
  library_key text,
  display_name text,
  source_schema text,
  source_object text,
  object_type text,
  status text,
  source text,
  notes text,
  discovered_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not core.is_platform_owner() then
    raise exception 'Platform owner access required';
  end if;

  return query
  select
    s.id,
    s.library_key,
    s.display_name,
    s.source_schema,
    s.source_object,
    s.object_type,
    s.status,
    s.source,
    s.notes,
    s.discovered_at,
    s.updated_at
  from platform.switchboard s
  order by s.source_schema, s.source_object;
end;
$$;

create or replace function public.update_platform_switchboard_record(
  p_id uuid,
  p_status text,
  p_source text,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not core.is_platform_owner() then
    raise exception 'Platform owner access required';
  end if;

  if p_status not in (
    'DISCOVERED',
    'DEFINED',
    'IMPLEMENTED',
    'ACTIVE',
    'RETIRED'
  ) then
    raise exception 'Invalid Switchboard status';
  end if;

  if p_source not in ('LEGACY', 'PLATFORM') then
    raise exception 'Invalid Switchboard source';
  end if;

  update platform.switchboard
  set
    status = p_status,
    source = p_source,
    notes = nullif(trim(p_notes), '')
  where id = p_id;

  if not found then
    raise exception 'Switchboard record not found';
  end if;
end;
$$;

revoke all on function public.get_platform_switchboard() from public;
revoke all on function public.get_platform_switchboard() from anon;
grant execute on function public.get_platform_switchboard()
  to authenticated, service_role;

revoke all on function public.update_platform_switchboard_record(
  uuid,
  text,
  text,
  text
) from public;

revoke all on function public.update_platform_switchboard_record(
  uuid,
  text,
  text,
  text
) from anon;

grant execute on function public.update_platform_switchboard_record(
  uuid,
  text,
  text,
  text
) to authenticated, service_role;

commit;
