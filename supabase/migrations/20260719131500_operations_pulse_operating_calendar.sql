-- In-day collection follows the customer's operating calendar before a runner
-- request is generated. Beacon Point currently operates Monday through Saturday;
-- dated overrides remain assignment-owned and take precedence in the generator.
update core.company_operations_ticket_assignment assignment
set
  assignment_payload_json = jsonb_set(
    coalesce(assignment.assignment_payload_json, '{}'::jsonb),
    '{operating_weekdays}',
    '[1,2,3,4,5,6]'::jsonb,
    true
  ),
  updated_at = now()
from core.companies company
where company.id = assignment.company_id
  and company.company_slug = 'beacon-point-ventures'
  and assignment.operational_contract = 'IN_DAY_OPERATIONS'
  and not coalesce(assignment.assignment_payload_json, '{}'::jsonb) ? 'operating_weekdays';
