begin;

create table if not exists core.company_message (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  title text not null,
  body text not null,
  status text not null default 'draft',
  visibility text not null default 'all',
  requires_ack boolean not null default true,
  published_at timestamptz,
  archived_at timestamptz,
  created_by_profile_id uuid references core.profiles(id),
  updated_by_profile_id uuid references core.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint company_message_title_ck check (length(btrim(title)) > 0),
  constraint company_message_body_ck check (length(btrim(body)) > 0),
  constraint company_message_status_ck check (
    status in ('draft', 'published', 'archived')
  ),
  constraint company_message_visibility_ck check (
    visibility in ('all', 'drivers', 'leadership')
  ),
  constraint company_message_published_at_ck check (
    (status = 'published' and published_at is not null)
    or status <> 'published'
  ),
  constraint company_message_archived_at_ck check (
    (status = 'archived' and archived_at is not null)
    or status <> 'archived'
  )
);

create table if not exists core.company_message_ack (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references core.company_message(id) on delete cascade,
  company_id uuid not null references core.companies(id) on delete cascade,
  profile_id uuid not null references core.profiles(id) on delete cascade,
  acknowledged_at timestamptz not null default now(),

  constraint company_message_ack_unique unique (message_id, profile_id)
);

create index if not exists company_message_company_status_idx
  on core.company_message (company_id, status, published_at desc);

create index if not exists company_message_visibility_idx
  on core.company_message (company_id, visibility, status);

create index if not exists company_message_ack_message_idx
  on core.company_message_ack (message_id);

create index if not exists company_message_ack_profile_idx
  on core.company_message_ack (company_id, profile_id);

drop trigger if exists company_message_set_updated_at on core.company_message;

create trigger company_message_set_updated_at
before update on core.company_message
for each row
execute function core.set_updated_at();

alter table core.company_message enable row level security;
alter table core.company_message_ack enable row level security;

-- Live-first repair:
-- A later targeted-recipient version of this helper may already exist remotely.
-- Drop dependent policies and helper overloads so this foundation migration can
-- apply cleanly before the targeted-recipient migration replaces the policies.
drop policy if exists company_message_select on core.company_message;
drop policy if exists company_message_ack_insert on core.company_message_ack;
drop function if exists core.can_receive_company_message(uuid, text, uuid);
drop function if exists core.can_receive_company_message(uuid, text);

create or replace function core.can_receive_company_message(
  p_company_id uuid,
  p_visibility text
)
returns boolean
language sql
stable
security definer
set search_path = core, public
as $$
  select
    core.is_platform_owner()
    or case
      when p_visibility = 'leadership' then
        core.can_admin_company(p_company_id)

      when p_visibility = 'drivers' then
        core.can_admin_company(p_company_id)
        or exists (
          select 1
          from core.company_roster r
          where r.company_id = p_company_id
            and r.profile_id = core.current_profile_id()
            and r.employment_status in ('Active', 'Trainee')
        )

      when p_visibility = 'all' then
        core.can_access_company(p_company_id)

      else false
    end;
$$;

grant execute on function core.can_receive_company_message(uuid, text) to authenticated;
grant execute on function core.can_receive_company_message(uuid, text) to service_role;

create policy company_message_select
on core.company_message
for select
to authenticated
using (
  core.can_admin_company(company_id)
  or (
    status = 'published'
    and archived_at is null
    and core.can_receive_company_message(company_id, visibility)
  )
);

drop policy if exists company_message_insert on core.company_message;
create policy company_message_insert
on core.company_message
for insert
to authenticated
with check (
  core.can_admin_company(company_id)
);

drop policy if exists company_message_update on core.company_message;
create policy company_message_update
on core.company_message
for update
to authenticated
using (
  core.can_admin_company(company_id)
)
with check (
  core.can_admin_company(company_id)
);

drop policy if exists company_message_ack_select on core.company_message_ack;
create policy company_message_ack_select
on core.company_message_ack
for select
to authenticated
using (
  core.can_admin_company(company_id)
  or profile_id = core.current_profile_id()
);

create policy company_message_ack_insert
on core.company_message_ack
for insert
to authenticated
with check (
  profile_id = core.current_profile_id()
  and exists (
    select 1
    from core.company_message m
    where m.id = message_id
      and m.company_id = company_message_ack.company_id
      and m.status = 'published'
      and m.archived_at is null
      and m.requires_ack = true
      and core.can_receive_company_message(m.company_id, m.visibility)
  )
);

drop policy if exists company_message_ack_update on core.company_message_ack;
create policy company_message_ack_update
on core.company_message_ack
for update
to authenticated
using (
  profile_id = core.current_profile_id()
)
with check (
  profile_id = core.current_profile_id()
);

create or replace view public.company_message
with (security_invoker = true)
as
select
  id,
  company_id,
  title,
  body,
  status,
  visibility,
  requires_ack,
  published_at,
  archived_at,
  created_by_profile_id,
  updated_by_profile_id,
  created_at,
  updated_at
from core.company_message;

create or replace view public.company_message_ack
with (security_invoker = true)
as
select
  id,
  message_id,
  company_id,
  profile_id,
  acknowledged_at
from core.company_message_ack;

grant select, insert, update on core.company_message to authenticated;
grant select, insert, update on core.company_message_ack to authenticated;

grant all on table public.company_message to authenticated;
grant all on table public.company_message_ack to authenticated;
grant all on table public.company_message to service_role;
grant all on table public.company_message_ack to service_role;

commit;
