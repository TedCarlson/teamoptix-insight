begin;

-- A holiday is a workforce override in the existing schedule ledger. Keep it
-- authoritative through every fact repaint, including days that were added by
-- an ADD_IN override.
create or replace function public.enforce_holiday_schedule_day_fact()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_holiday_override_id uuid;
begin
  select holiday.id
  into v_holiday_override_id
  from public.schedule_override holiday
  where holiday.company_id = new.company_id
    and holiday.roster_member_id = new.roster_member_id
    and holiday.override_type = 'HOLIDAY'
    and holiday.is_active = true
    and new.service_date between holiday.start_date and holiday.end_date
  order by holiday.created_at desc
  limit 1;

  if v_holiday_override_id is not null then
    new.planned_on := false;
    new.route_name := null;
    new.source_kind := 'OVERRIDE';
    new.override_id := v_holiday_override_id;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_holiday_schedule_day_fact
on public.schedule_day_fact;

create trigger enforce_holiday_schedule_day_fact
before insert or update on public.schedule_day_fact
for each row
execute function public.enforce_holiday_schedule_day_fact();

comment on function public.enforce_holiday_schedule_day_fact() is
  'Gives an active HOLIDAY workforce override final precedence whenever the authoritative schedule fact is painted.';

revoke all on function public.enforce_holiday_schedule_day_fact()
from public, anon, authenticated;

commit;
