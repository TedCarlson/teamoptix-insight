-- Enforce the familiar candidate workflow as a dependency sequence. The UI
-- mirrors these rules, but the function remains authoritative for every client.

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
  v_item_kind text;
  v_completed_at timestamptz;
  v_missing_prerequisites text;
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

  v_item_kind := case
    when v_item_workflow_text similar to '%tsa%' then 'tsa'
    when v_item_workflow_text similar to '%interview%(scheduled|schedule)%' then 'interview_scheduled'
    when v_item_workflow_text similar to '%interview%(complete|completed|passed)%' then 'interview_complete'
    when v_item_workflow_text like '%background%'
      and v_item_workflow_text similar to '%(submit|submitted|authorization|authorized)%' then 'background_submitted'
    when v_item_workflow_text like '%background%' then 'background_complete'
    when v_item_workflow_text similar to '%drug%(screen|test)%(send|sent|request)%' then 'drug_sent'
    when v_item_workflow_text similar to '%drug%(screen|test)%(pass|passed|complete|completed|clear|cleared)%' then 'drug_passed'
    when v_item_workflow_text similar to '%dot%physical%(send|sent|request)%' then 'dot_sent'
    when v_item_workflow_text similar to '%dot%physical%(pass|passed|complete|completed|clear|cleared)%' then 'dot_passed'
    else 'other'
  end;

  if p_is_complete and v_item_kind in (
    'interview_complete',
    'background_submitted',
    'background_complete',
    'drug_sent',
    'drug_passed',
    'dot_sent',
    'dot_passed'
  ) then
    select string_agg(config.display_label, ' and ' order by config.sort_order)
    into v_missing_prerequisites
    from core.company_candidate_checklist_config config
    join core.candidate_checklist_item_type item
      on item.id = config.item_type_id
    left join core.roster_candidate_checklist_fact fact
      on fact.company_id = config.company_id
      and fact.roster_id = p_roster_id
      and fact.item_type_id = config.item_type_id
    cross join lateral (
      select lower(concat_ws(' ', item.item_key, item.default_label, config.display_label)) as workflow_text
    ) semantic
    where config.company_id = v_company_id
      and config.is_enabled = true
      and item.is_active = true
      and coalesce(fact.is_complete, false) = false
      and case v_item_kind
        when 'interview_complete' then
          semantic.workflow_text similar to '%interview%(scheduled|schedule)%'
        when 'background_submitted' then
          semantic.workflow_text similar to '%interview%(complete|completed|passed)%'
        when 'background_complete' then
          semantic.workflow_text like '%background%'
          and semantic.workflow_text similar to '%(submit|submitted|authorization|authorized)%'
          and semantic.workflow_text not similar to '%tsa%'
        when 'drug_sent' then
          semantic.workflow_text like '%background%'
          and semantic.workflow_text not similar to '%tsa%'
        when 'dot_sent' then
          semantic.workflow_text like '%background%'
          and semantic.workflow_text not similar to '%tsa%'
        when 'drug_passed' then
          semantic.workflow_text similar to '%drug%(screen|test)%(send|sent|request)%'
        when 'dot_passed' then
          semantic.workflow_text similar to '%dot%physical%(send|sent|request)%'
        else false
      end;

    if v_missing_prerequisites is not null then
      raise exception 'Complete % before %.', v_missing_prerequisites, v_item_label;
    end if;
  end if;

  if p_is_complete and v_item_kind = 'tsa' then
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
  'Updates candidate checklist facts and enforces interview, background, screening, and post-promotion TSA dependencies.';

revoke all on function public.candidate_checklist_set_item(text, uuid, text, boolean, text) from public;
grant execute on function public.candidate_checklist_set_item(text, uuid, text, boolean, text)
  to authenticated, service_role;
