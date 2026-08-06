-- Align the candidate checklist with the actual screening workflow:
-- background work is completed before drug-screen or DOT-physical requests
-- can be marked as sent. The database rule protects every consuming surface.

update core.candidate_checklist_item_type item
set sort_order = case
  when lower(concat_ws(' ', item.item_key, item.default_label)) similar to '%tsa%(submit|submitted|send|sent|request|authorization|authorized)%' then 900
  when lower(concat_ws(' ', item.item_key, item.default_label)) like '%tsa%' then 910
  when lower(concat_ws(' ', item.item_key, item.default_label)) similar to '%interview%(scheduled|schedule)%' then 10
  when lower(concat_ws(' ', item.item_key, item.default_label)) similar to '%interview%(complete|completed)%' then 20
  when lower(concat_ws(' ', item.item_key, item.default_label)) like '%background%'
    and lower(concat_ws(' ', item.item_key, item.default_label)) similar to '%(submit|submitted|authorization|authorized)%' then 30
  when lower(concat_ws(' ', item.item_key, item.default_label)) like '%background%' then 40
  when lower(concat_ws(' ', item.item_key, item.default_label)) similar to '%drug%(screen|test)%(send|sent|request)%' then 50
  when lower(concat_ws(' ', item.item_key, item.default_label)) similar to '%dot%physical%(send|sent|request)%' then 60
  when lower(concat_ws(' ', item.item_key, item.default_label)) similar to '%drug%(screen|test)%(pass|passed|complete|completed|clear|cleared)%' then 70
  when lower(concat_ws(' ', item.item_key, item.default_label)) similar to '%dot%physical%(pass|passed|complete|completed|clear|cleared)%' then 80
  else item.sort_order
end,
updated_at = now()
where lower(concat_ws(' ', item.item_key, item.default_label)) similar to
  '%(interview|background|drug%screen|drug%test|dot%physical|tsa)%';

update core.company_candidate_checklist_config config
set sort_order = case
  when lower(concat_ws(' ', item.item_key, item.default_label, config.display_label)) similar to '%tsa%(submit|submitted|send|sent|request|authorization|authorized)%' then 900
  when lower(concat_ws(' ', item.item_key, item.default_label, config.display_label)) like '%tsa%' then 910
  when lower(concat_ws(' ', item.item_key, item.default_label, config.display_label)) similar to '%interview%(scheduled|schedule)%' then 10
  when lower(concat_ws(' ', item.item_key, item.default_label, config.display_label)) similar to '%interview%(complete|completed)%' then 20
  when lower(concat_ws(' ', item.item_key, item.default_label, config.display_label)) like '%background%'
    and lower(concat_ws(' ', item.item_key, item.default_label, config.display_label)) similar to '%(submit|submitted|authorization|authorized)%' then 30
  when lower(concat_ws(' ', item.item_key, item.default_label, config.display_label)) like '%background%' then 40
  when lower(concat_ws(' ', item.item_key, item.default_label, config.display_label)) similar to '%drug%(screen|test)%(send|sent|request)%' then 50
  when lower(concat_ws(' ', item.item_key, item.default_label, config.display_label)) similar to '%dot%physical%(send|sent|request)%' then 60
  when lower(concat_ws(' ', item.item_key, item.default_label, config.display_label)) similar to '%drug%(screen|test)%(pass|passed|complete|completed|clear|cleared)%' then 70
  when lower(concat_ws(' ', item.item_key, item.default_label, config.display_label)) similar to '%dot%physical%(pass|passed|complete|completed|clear|cleared)%' then 80
  else config.sort_order
end,
updated_at = now()
from core.candidate_checklist_item_type item
where item.id = config.item_type_id
  and lower(concat_ws(' ', item.item_key, item.default_label, config.display_label)) similar to
    '%(interview|background|drug%screen|drug%test|dot%physical|tsa)%';

create or replace function public.candidate_checklist_set_item(
  p_company_slug text,
  p_roster_id uuid,
  p_item_key text,
  p_is_complete boolean,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'core', 'public'
as $$
declare
  v_company_id uuid;
  v_item_type_id uuid;
  v_item_label text;
  v_item_workflow_text text;
  v_completed_at timestamptz;
  v_missing_background text;
  v_missing_pre_tsa text;
  v_employment_status text;
begin
  select c.id
  into v_company_id
  from core.companies c
  where c.company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found';
  end if;

  select
    cfg.item_type_id,
    cfg.display_label,
    lower(concat_ws(' ', item.item_key, item.default_label, cfg.display_label))
  into
    v_item_type_id,
    v_item_label,
    v_item_workflow_text
  from core.company_candidate_checklist_config cfg
  join core.candidate_checklist_item_type item
    on item.id = cfg.item_type_id
  where cfg.company_id = v_company_id
    and cfg.is_enabled = true
    and item.item_key = p_item_key
    and item.is_active = true
  limit 1;

  if v_item_type_id is null then
    raise exception 'Checklist item not found';
  end if;

  if p_is_complete
    and (
      v_item_workflow_text similar to '%drug%(screen|test)%(send|sent|request)%'
      or v_item_workflow_text similar to '%dot%physical%(send|sent|request)%'
    )
  then
    select string_agg(config.display_label, ' and ' order by config.sort_order)
    into v_missing_background
    from core.company_candidate_checklist_config config
    join core.candidate_checklist_item_type item
      on item.id = config.item_type_id
    left join core.roster_candidate_checklist_fact fact
      on fact.company_id = config.company_id
      and fact.roster_id = p_roster_id
      and fact.item_type_id = config.item_type_id
    where config.company_id = v_company_id
      and config.is_enabled = true
      and config.is_required = true
      and item.is_active = true
      and lower(concat_ws(' ', item.item_key, item.default_label, config.display_label)) like '%background%'
      and lower(concat_ws(' ', item.item_key, item.default_label, config.display_label)) not similar to '%tsa%'
      and coalesce(fact.is_complete, false) = false;

    if v_missing_background is not null then
      raise exception 'Complete % before %.', v_missing_background, v_item_label;
    end if;
  end if;

  if p_is_complete and v_item_workflow_text similar to '%tsa%' then
    select roster.employment_status
    into v_employment_status
    from core.company_roster roster
    where roster.company_id = v_company_id
      and roster.id = p_roster_id;

    if v_employment_status is null then
      raise exception 'Candidate roster record not found';
    end if;

    if v_employment_status not in ('Active', 'Trainee') then
      raise exception 'Promote the candidate to Trainee or Active before beginning TSA processing.';
    end if;

    select string_agg(config.display_label, ', ' order by config.sort_order)
    into v_missing_pre_tsa
    from core.company_candidate_checklist_config config
    join core.candidate_checklist_item_type item
      on item.id = config.item_type_id
    left join core.roster_candidate_checklist_fact fact
      on fact.company_id = config.company_id
      and fact.roster_id = p_roster_id
      and fact.item_type_id = config.item_type_id
    where config.company_id = v_company_id
      and config.is_enabled = true
      and config.is_required = true
      and item.is_active = true
      and lower(concat_ws(' ', item.item_key, item.default_label, config.display_label)) not similar to '%tsa%'
      and coalesce(fact.is_complete, false) = false;

    if v_missing_pre_tsa is not null then
      raise exception 'Complete % before beginning TSA processing.', v_missing_pre_tsa;
    end if;
  end if;

  v_completed_at := case when p_is_complete then now() else null end;

  insert into core.roster_candidate_checklist_fact (
    company_id,
    roster_id,
    item_type_id,
    is_complete,
    completed_at,
    note,
    updated_at
  )
  values (
    v_company_id,
    p_roster_id,
    v_item_type_id,
    p_is_complete,
    v_completed_at,
    p_note,
    now()
  )
  on conflict (company_id, roster_id, item_type_id)
  do update set
    is_complete = excluded.is_complete,
    completed_at = excluded.completed_at,
    note = excluded.note,
    updated_at = now();

  insert into core.company_roster_event (
    company_id,
    roster_id,
    event_category,
    event_type,
    event_detail,
    event_metadata,
    occurred_at
  )
  values (
    v_company_id,
    p_roster_id,
    'hiring',
    case
      when p_is_complete then 'candidate_checklist_item_completed'
      else 'candidate_checklist_item_reopened'
    end,
    v_item_label || case when p_is_complete then ' completed.' else ' reopened.' end,
    jsonb_build_object(
      'item_key', p_item_key,
      'item_label', v_item_label,
      'note', p_note
    ),
    now()
  );

  return jsonb_build_object(
    'ok', true,
    'item_key', p_item_key,
    'item_label', v_item_label,
    'is_complete', p_is_complete
  );
end;
$$;

comment on function public.candidate_checklist_set_item(text, uuid, text, boolean, text) is
  'Updates candidate checklist facts, gates screening sends behind background completion, and gates TSA behind roster promotion plus all other required readiness.';

revoke all on function public.candidate_checklist_set_item(text, uuid, text, boolean, text) from public;
grant execute on function public.candidate_checklist_set_item(text, uuid, text, boolean, text)
  to authenticated, service_role;
