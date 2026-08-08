begin;

insert into core.dispatch_event_type (
  company_id,
  event_code,
  event_label,
  event_category,
  source,
  entry_mode,
  requires_person,
  requires_route,
  requires_assignment,
  allows_note,
  requires_note,
  sort_order
)
select
  null,
  'PASS_ROUTE_TO_CSA',
  'Pass route to CSA',
  'COVERAGE',
  'system',
  'manual',
  false,
  true,
  false,
  true,
  false,
  145
where not exists (
  select 1
  from core.dispatch_event_type event_type
  where event_type.company_id is null
    and event_type.event_code = 'PASS_ROUTE_TO_CSA'
);

update core.dispatch_event_type
set
  event_label = 'Pass route to CSA',
  event_category = 'COVERAGE',
  source = 'system',
  entry_mode = 'manual',
  requires_person = false,
  requires_route = true,
  requires_assignment = false,
  allows_note = true,
  requires_note = false,
  sort_order = 145
where company_id is null
  and event_code = 'PASS_ROUTE_TO_CSA';

notify pgrst, 'reload schema';

commit;
