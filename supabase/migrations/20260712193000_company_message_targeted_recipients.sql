begin;

create table if not exists core.company_message_recipient (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references core.company_message(id) on delete cascade,
  company_id uuid not null references core.companies(id) on delete cascade,
  roster_member_id uuid not null references core.company_roster(id) on delete cascade,
  profile_id uuid references core.profiles(id) on delete set null,
  person_id uuid,
  created_at timestamptz not null default now(),

  constraint company_message_recipient_unique unique (message_id, roster_member_id)
);

create index if not exists company_message_recipient_message_idx
  on core.company_message_recipient (message_id);

create index if not exists company_message_recipient_roster_idx
  on core.company_message_recipient (company_id, roster_member_id);

create index if not exists company_message_recipient_profile_idx
  on core.company_message_recipient (company_id, profile_id);

alter table core.company_message_recipient enable row level security;

drop policy if exists company_message_recipient_select on core.company_message_recipient;
create policy company_message_recipient_select
on core.company_message_recipient
for select
to authenticated
using (
  core.can_admin_company(company_id)
  or profile_id = core.current_profile_id()
  or exists (
    select 1
    from core.company_roster r
    where r.id = company_message_recipient.roster_member_id
      and r.company_id = company_message_recipient.company_id
      and r.profile_id = core.current_profile_id()
  )
);

drop policy if exists company_message_recipient_insert on core.company_message_recipient;
create policy company_message_recipient_insert
on core.company_message_recipient
for insert
to authenticated
with check (
  core.can_admin_company(company_id)
);

drop policy if exists company_message_recipient_update on core.company_message_recipient;
create policy company_message_recipient_update
on core.company_message_recipient
for update
to authenticated
using (
  core.can_admin_company(company_id)
)
with check (
  core.can_admin_company(company_id)
);

drop policy if exists company_message_recipient_delete on core.company_message_recipient;
create policy company_message_recipient_delete
on core.company_message_recipient
for delete
to authenticated
using (
  core.can_admin_company(company_id)
);

create or replace function core.can_receive_company_message(
  p_company_id uuid,
  p_visibility text,
  p_message_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = core, public
as $$
  with current_roster as (
    select
      r.id as roster_member_id,
      r.profile_id,
      r.person_id,
      r.employment_status
    from core.company_roster r
    where r.company_id = p_company_id
      and r.profile_id = core.current_profile_id()
    limit 1
  ),
  targeted as (
    select exists (
      select 1
      from core.company_message_recipient mr
      where mr.company_id = p_company_id
        and mr.message_id = p_message_id
    ) as has_targets
  )
  select
    core.is_platform_owner()
    or case
      when p_visibility = 'leadership' then
        core.can_admin_company(p_company_id)

      when p_visibility = 'drivers' then
        core.can_admin_company(p_company_id)
        or exists (
          select 1
          from current_roster cr
          cross join targeted t
          where cr.employment_status in ('Active', 'Trainee')
            and (
              p_message_id is null
              or not t.has_targets
              or exists (
                select 1
                from core.company_message_recipient mr
                where mr.company_id = p_company_id
                  and mr.message_id = p_message_id
                  and mr.roster_member_id = cr.roster_member_id
              )
            )
        )

      when p_visibility = 'all' then
        core.can_access_company(p_company_id)

      else false
    end;
$$;

grant execute on function core.can_receive_company_message(uuid, text, uuid) to authenticated;
grant execute on function core.can_receive_company_message(uuid, text, uuid) to service_role;

drop policy if exists company_message_select on core.company_message;
create policy company_message_select
on core.company_message
for select
to authenticated
using (
  core.can_admin_company(company_id)
  or (
    status = 'published'
    and archived_at is null
    and core.can_receive_company_message(company_id, visibility, id)
  )
);

drop policy if exists company_message_ack_insert on core.company_message_ack;
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
      and core.can_receive_company_message(m.company_id, m.visibility, m.id)
  )
);

create or replace view public.company_message_recipient
with (security_invoker = true)
as
select
  id,
  message_id,
  company_id,
  roster_member_id,
  profile_id,
  person_id,
  created_at
from core.company_message_recipient;

grant select, insert, update, delete on core.company_message_recipient to authenticated;
grant all on table public.company_message_recipient to authenticated;
grant all on table public.company_message_recipient to service_role;

commit;
