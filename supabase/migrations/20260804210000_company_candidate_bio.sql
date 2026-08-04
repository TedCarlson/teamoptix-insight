begin;

create table if not exists core.company_candidate_bio (
  company_id uuid primary key references core.companies(id) on delete cascade,
  headline text,
  summary text,
  terminal_name text,
  terminal_address text,
  primary_work_area text,
  work_description text,
  candidate_note text,
  is_published boolean not null default false,
  updated_by_profile_id uuid references core.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_updated_at_on_company_candidate_bio on core.company_candidate_bio;
create trigger set_updated_at_on_company_candidate_bio
before update on core.company_candidate_bio
for each row execute function core.set_updated_at();

alter table core.company_candidate_bio enable row level security;

create policy company_candidate_bio_select_access
on core.company_candidate_bio for select to authenticated
using (core.is_platform_owner() or core.can_access_company(company_id));

create policy company_candidate_bio_insert_admin
on core.company_candidate_bio for insert to authenticated
with check (core.is_platform_owner() or core.can_admin_company(company_id));

create policy company_candidate_bio_update_admin
on core.company_candidate_bio for update to authenticated
using (core.is_platform_owner() or core.can_admin_company(company_id))
with check (core.is_platform_owner() or core.can_admin_company(company_id));

create policy company_candidate_bio_delete_admin
on core.company_candidate_bio for delete to authenticated
using (core.is_platform_owner() or core.can_admin_company(company_id));

create or replace view public.company_candidate_bio_v
with (security_invoker = true) as
select
  bio.company_id,
  company.company_name,
  company.company_slug,
  company.logo_url,
  bio.headline,
  bio.summary,
  bio.terminal_name,
  bio.terminal_address,
  bio.primary_work_area,
  bio.work_description,
  bio.candidate_note,
  bio.is_published,
  bio.updated_at
from core.company_candidate_bio bio
join core.companies company on company.id = bio.company_id;

create or replace function public.get_company_candidate_bio_admin(
  p_company_slug text
) returns jsonb
language plpgsql
stable
security definer
set search_path = core, public
as $$
declare
  v_company core.companies%rowtype;
  v_bio core.company_candidate_bio%rowtype;
  v_terminal public.company_terminal%rowtype;
  v_service_area text;
begin
  select * into v_company from core.companies
  where company_slug = lower(btrim(p_company_slug));
  if v_company.id is null then raise exception 'Company not found.'; end if;
  if not (core.is_platform_owner() or core.can_access_company(v_company.id)) then
    raise exception 'Forbidden.';
  end if;

  select * into v_bio from core.company_candidate_bio where company_id = v_company.id;
  select * into v_terminal from public.company_terminal
  where company_id = v_company.id and is_active = true
  order by created_at limit 1;
  select service_area into v_service_area
  from core.company_contract_config
  where company_id = v_company.id and status = 'ACTIVE'
  order by effective_start_date desc limit 1;

  return jsonb_build_object(
    'company_id', v_company.id,
    'headline', v_bio.headline,
    'summary', v_bio.summary,
    'terminal_name', coalesce(v_bio.terminal_name, v_terminal.terminal_name),
    'terminal_address', coalesce(
      v_bio.terminal_address,
      nullif(concat_ws(', ',
        nullif(concat_ws(' ', v_terminal.address_line_1, v_terminal.address_line_2), ''),
        nullif(concat_ws(' ', v_terminal.city, v_terminal.state_region, v_terminal.postal_code), '')
      ), '')
    ),
    'primary_work_area', coalesce(v_bio.primary_work_area, v_service_area),
    'work_description', v_bio.work_description,
    'candidate_note', v_bio.candidate_note,
    'is_published', coalesce(v_bio.is_published, false),
    'updated_at', v_bio.updated_at
  );
end;
$$;

create or replace function public.upsert_company_candidate_bio(
  p_company_slug text,
  p_headline text,
  p_summary text,
  p_terminal_name text,
  p_terminal_address text,
  p_primary_work_area text,
  p_work_description text,
  p_candidate_note text,
  p_is_published boolean
) returns jsonb
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_company_id uuid;
  v_bio core.company_candidate_bio%rowtype;
begin
  select id into v_company_id from core.companies
  where company_slug = lower(btrim(p_company_slug));
  if v_company_id is null then raise exception 'Company not found.'; end if;
  if not (core.is_platform_owner() or core.can_admin_company(v_company_id)) then
    raise exception 'Forbidden.';
  end if;

  insert into core.company_candidate_bio (
    company_id, headline, summary, terminal_name, terminal_address,
    primary_work_area, work_description, candidate_note, is_published,
    updated_by_profile_id
  ) values (
    v_company_id, nullif(btrim(coalesce(p_headline, '')), ''),
    nullif(btrim(coalesce(p_summary, '')), ''),
    nullif(btrim(coalesce(p_terminal_name, '')), ''),
    nullif(btrim(coalesce(p_terminal_address, '')), ''),
    nullif(btrim(coalesce(p_primary_work_area, '')), ''),
    nullif(btrim(coalesce(p_work_description, '')), ''),
    nullif(btrim(coalesce(p_candidate_note, '')), ''),
    coalesce(p_is_published, false), core.current_profile_id()
  )
  on conflict (company_id) do update set
    headline = excluded.headline,
    summary = excluded.summary,
    terminal_name = excluded.terminal_name,
    terminal_address = excluded.terminal_address,
    primary_work_area = excluded.primary_work_area,
    work_description = excluded.work_description,
    candidate_note = excluded.candidate_note,
    is_published = excluded.is_published,
    updated_by_profile_id = excluded.updated_by_profile_id,
    updated_at = now()
  returning * into v_bio;

  return to_jsonb(v_bio);
end;
$$;

grant select on core.company_candidate_bio to authenticated, service_role;
grant select on public.company_candidate_bio_v to authenticated, service_role;

revoke all on function public.get_company_candidate_bio_admin(text) from public;
grant execute on function public.get_company_candidate_bio_admin(text)
to authenticated, service_role;

revoke all on function public.upsert_company_candidate_bio(
  text, text, text, text, text, text, text, text, boolean
) from public;
grant execute on function public.upsert_company_candidate_bio(
  text, text, text, text, text, text, text, text, boolean
) to authenticated, service_role;

comment on table core.company_candidate_bio is
  'HR-managed candidate-facing company and operating-location context shown in the Foyer.';

commit;
