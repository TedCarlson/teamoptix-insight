begin;

-- Present screening work as two parallel phases: every request can be sent
-- after the interview, and results can arrive in any order.
update core.candidate_checklist_item_type item
set sort_order = case
  when lower(concat_ws(' ', item.item_key, item.default_label)) similar to '%tsa%(submit|submitted|send|sent|request|authorization|authorized)%' then 900
  when lower(concat_ws(' ', item.item_key, item.default_label)) like '%tsa%' then 910
  when lower(concat_ws(' ', item.item_key, item.default_label)) similar to '%interview%(scheduled|schedule)%' then 10
  when lower(concat_ws(' ', item.item_key, item.default_label)) similar to '%interview%(complete|completed)%' then 20
  when lower(concat_ws(' ', item.item_key, item.default_label)) like '%background%'
    and lower(concat_ws(' ', item.item_key, item.default_label)) similar to '%(submit|submitted|authorization|authorized)%' then 30
  when lower(concat_ws(' ', item.item_key, item.default_label)) similar to '%drug%(screen|test)%(send|sent|request)%' then 40
  when lower(concat_ws(' ', item.item_key, item.default_label)) similar to '%dot%physical%(send|sent|request)%' then 50
  when lower(concat_ws(' ', item.item_key, item.default_label)) like '%background%' then 60
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
  when lower(concat_ws(' ', item.item_key, item.default_label, config.display_label)) similar to '%drug%(screen|test)%(send|sent|request)%' then 40
  when lower(concat_ws(' ', item.item_key, item.default_label, config.display_label)) similar to '%dot%physical%(send|sent|request)%' then 50
  when lower(concat_ws(' ', item.item_key, item.default_label, config.display_label)) like '%background%' then 60
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
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_company_id uuid;
  v_item_type_id uuid;
  v_item_label text;
  v_item_workflow_text text;
  v_item_kind text;
  v_completed_at timestamptz;
  v_missing_prerequisites text;
  v_missing_pre_tsa text;
  v_employment_status text;
  v_implied_item_type_id uuid;
  v_implied_item_key text;
  v_implied_item_label text;
  v_implied_rows integer := 0;
begin
  if auth.uid() is not null then
    select profile.id
    into v_profile_id
    from core.profiles profile
    where profile.auth_user_id = auth.uid()
      and profile.profile_status = 'active'
    limit 1;

    if v_profile_id is null then
      raise exception 'ACTIVE_PROFILE_REQUIRED';
    end if;
  elsif coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  select company.id
  into v_company_id
  from core.companies company
  where company.company_slug = lower(btrim(p_company_slug))
    and company.company_status = 'active'
  limit 1;

  if v_company_id is null then
    raise exception 'ACTIVE_COMPANY_REQUIRED';
  end if;

  if auth.uid() is not null
    and not core.mobile_companion_can_use_workspace(v_company_id, 'hiring')
  then
    raise exception 'HIRING_GRANT_REQUIRED';
  end if;

  select roster.employment_status
  into v_employment_status
  from core.company_roster roster
  where roster.company_id = v_company_id
    and roster.id = p_roster_id;

  if not found then
    raise exception 'ROSTER_RECORD_REQUIRED';
  end if;

  select
    config.item_type_id,
    coalesce(config.display_label, item.default_label),
    lower(concat_ws(' ', item.item_key, item.default_label, config.display_label))
  into
    v_item_type_id,
    v_item_label,
    v_item_workflow_text
  from core.company_candidate_checklist_config config
  join core.candidate_checklist_item_type item
    on item.id = config.item_type_id
  where config.company_id = v_company_id
    and config.is_enabled = true
    and item.item_key = btrim(p_item_key)
    and item.is_active = true
  limit 1;

  if v_item_type_id is null then
    raise exception 'CHECKLIST_ITEM_REQUIRED';
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

  -- Sent milestones run in parallel after the interview. Passed milestones do
  -- not wait: their corresponding sent milestone is written below atomically.
  if p_is_complete and v_item_kind in (
    'interview_complete',
    'background_submitted',
    'drug_sent',
    'dot_sent'
  ) then
    select string_agg(
      coalesce(config.display_label, item.default_label),
      ' and '
      order by config.sort_order
    )
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
        when 'drug_sent' then
          semantic.workflow_text similar to '%interview%(complete|completed|passed)%'
        when 'dot_sent' then
          semantic.workflow_text similar to '%interview%(complete|completed|passed)%'
        else false
      end;

    if v_missing_prerequisites is not null then
      raise exception 'Complete % before %.', v_missing_prerequisites, v_item_label;
    end if;
  end if;

  if p_is_complete and v_item_kind = 'tsa' then
    if v_employment_status not in ('Active', 'Trainee') then
      raise exception 'Promote the candidate to Trainee or Active before beginning TSA processing.';
    end if;

    select string_agg(
      coalesce(config.display_label, item.default_label),
      ', '
      order by config.sort_order
    )
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
    occurred_at,
    created_by_profile_id
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
    now(),
    v_profile_id
  );

  if p_is_complete and v_item_kind in (
    'background_complete',
    'drug_passed',
    'dot_passed'
  ) then
    select
      config.item_type_id,
      item.item_key,
      coalesce(config.display_label, item.default_label)
    into
      v_implied_item_type_id,
      v_implied_item_key,
      v_implied_item_label
    from core.company_candidate_checklist_config config
    join core.candidate_checklist_item_type item
      on item.id = config.item_type_id
    cross join lateral (
      select lower(concat_ws(' ', item.item_key, item.default_label, config.display_label)) as workflow_text
    ) semantic
    where config.company_id = v_company_id
      and config.is_enabled = true
      and item.is_active = true
      and case v_item_kind
        when 'background_complete' then
          semantic.workflow_text like '%background%'
          and semantic.workflow_text similar to '%(submit|submitted|authorization|authorized)%'
          and semantic.workflow_text not similar to '%tsa%'
        when 'drug_passed' then
          semantic.workflow_text similar to '%drug%(screen|test)%(send|sent|request)%'
        when 'dot_passed' then
          semantic.workflow_text similar to '%dot%physical%(send|sent|request)%'
        else false
      end
    order by config.sort_order
    limit 1;

    if v_implied_item_type_id is not null then
      insert into core.roster_candidate_checklist_fact as existing (
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
        v_implied_item_type_id,
        true,
        now(),
        null,
        now()
      )
      on conflict (company_id, roster_id, item_type_id)
      do update set
        is_complete = true,
        completed_at = coalesce(existing.completed_at, excluded.completed_at),
        updated_at = now()
      where existing.is_complete = false;

      get diagnostics v_implied_rows = row_count;

      if v_implied_rows > 0 then
        insert into core.company_roster_event (
          company_id,
          roster_id,
          event_category,
          event_type,
          event_detail,
          event_metadata,
          occurred_at,
          created_by_profile_id
        )
        values (
          v_company_id,
          p_roster_id,
          'hiring',
          'candidate_checklist_item_completed',
          v_implied_item_label || ' completed automatically.',
          jsonb_build_object(
            'item_key', v_implied_item_key,
            'item_label', v_implied_item_label,
            'source', 'passed_implies_sent',
            'trigger_item_key', p_item_key
          ),
          now(),
          v_profile_id
        );
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'item_key', p_item_key,
    'item_label', v_item_label,
    'is_complete', p_is_complete,
    'implied_sent_item_key', v_implied_item_key,
    'implied_sent_completed', v_implied_rows > 0
  );
end;
$$;

comment on function public.candidate_checklist_set_item(text, uuid, text, boolean, text) is
  'Updates candidate checklist facts, allows parallel screening milestones, derives sent from passed, and gates TSA behind roster promotion plus all other required readiness.';

revoke all on function public.candidate_checklist_set_item(text, uuid, text, boolean, text)
  from public, anon;
grant execute on function public.candidate_checklist_set_item(text, uuid, text, boolean, text)
  to authenticated, service_role;

commit;
