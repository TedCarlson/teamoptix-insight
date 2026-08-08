begin;

create table if not exists core.company_payroll_summary_memo (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  roster_member_id uuid not null references core.company_roster(id) on delete cascade,
  week_end_date date not null,
  memo text not null,
  created_by_profile_id uuid,
  updated_by_profile_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint company_payroll_summary_memo_unique
    unique (company_id, roster_member_id, week_end_date),
  constraint company_payroll_summary_memo_text_chk
    check (length(btrim(memo)) between 1 and 2000)
);

create index if not exists company_payroll_summary_memo_period_idx
  on core.company_payroll_summary_memo (company_id, week_end_date);

alter table core.company_payroll_summary_memo enable row level security;

drop policy if exists company_payroll_summary_memo_select_access
  on core.company_payroll_summary_memo;
create policy company_payroll_summary_memo_select_access
  on core.company_payroll_summary_memo
  for select
  to authenticated
  using (
    core.is_platform_owner()
    or core.can_access_company(company_id)
  );

create or replace function public.list_company_payroll_summary_memos(
  p_company_slug text,
  p_week_end_date date
)
returns table (
  roster_member_id uuid,
  week_end_date date,
  memo text,
  updated_at timestamptz,
  updated_by_profile_id uuid
)
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_company_id uuid;
begin
  select company.id
  into v_company_id
  from core.companies company
  where company.company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found.';
  end if;

  if not (
    core.is_platform_owner()
    or core.can_access_company(v_company_id)
  ) then
    raise exception 'Company access is required.';
  end if;

  return query
  select
    row_memo.roster_member_id,
    row_memo.week_end_date,
    row_memo.memo,
    row_memo.updated_at,
    row_memo.updated_by_profile_id
  from core.company_payroll_summary_memo row_memo
  where row_memo.company_id = v_company_id
    and row_memo.week_end_date = p_week_end_date
  order by row_memo.updated_at desc;
end;
$$;

create or replace function public.set_company_payroll_summary_memo(
  p_company_slug text,
  p_roster_member_id uuid,
  p_week_end_date date,
  p_memo text
)
returns jsonb
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_company_id uuid;
  v_profile_id uuid := core.current_profile_id();
  v_memo text := nullif(btrim(coalesce(p_memo, '')), '');
  v_row core.company_payroll_summary_memo;
begin
  select company.id
  into v_company_id
  from core.companies company
  where company.company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found.';
  end if;

  if not (
    core.is_platform_owner()
    or core.can_admin_company(v_company_id)
  ) then
    raise exception 'Company payroll administrator access is required.';
  end if;

  if p_week_end_date is null then
    raise exception 'Payroll week ending date is required.';
  end if;

  if not exists (
    select 1
    from core.company_roster roster
    where roster.id = p_roster_member_id
      and roster.company_id = v_company_id
  ) then
    raise exception 'Roster member not found for this company.';
  end if;

  if length(coalesce(v_memo, '')) > 2000 then
    raise exception 'Payroll memo cannot exceed 2000 characters.';
  end if;

  if v_memo is null then
    delete from core.company_payroll_summary_memo row_memo
    where row_memo.company_id = v_company_id
      and row_memo.roster_member_id = p_roster_member_id
      and row_memo.week_end_date = p_week_end_date;

    return jsonb_build_object(
      'roster_member_id', p_roster_member_id,
      'week_end_date', p_week_end_date,
      'memo', null,
      'deleted', true
    );
  end if;

  insert into core.company_payroll_summary_memo (
    company_id,
    roster_member_id,
    week_end_date,
    memo,
    created_by_profile_id,
    updated_by_profile_id
  )
  values (
    v_company_id,
    p_roster_member_id,
    p_week_end_date,
    v_memo,
    v_profile_id,
    v_profile_id
  )
  on conflict (company_id, roster_member_id, week_end_date)
  do update set
    memo = excluded.memo,
    updated_by_profile_id = excluded.updated_by_profile_id,
    updated_at = now()
  returning * into v_row;

  return jsonb_build_object(
    'roster_member_id', v_row.roster_member_id,
    'week_end_date', v_row.week_end_date,
    'memo', v_row.memo,
    'updated_at', v_row.updated_at,
    'updated_by_profile_id', v_row.updated_by_profile_id,
    'deleted', false
  );
end;
$$;

revoke all on function public.list_company_payroll_summary_memos(text, date)
  from public, anon;
grant execute on function public.list_company_payroll_summary_memos(text, date)
  to authenticated, service_role;

revoke all on function public.set_company_payroll_summary_memo(text, uuid, date, text)
  from public, anon;
grant execute on function public.set_company_payroll_summary_memo(text, uuid, date, text)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
