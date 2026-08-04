begin;

-- The first-pass UI briefly exposed provider placeholders that do not have a
-- working interview surface. Normalize those records to the operational
-- default and keep the scheduling contract aligned with actual company use.
update core.candidate_interview_slot
set meeting_provider = 'phone'
where meeting_provider not in ('phone', 'in_person');

update core.candidate_interview
set meeting_provider = 'phone'
where meeting_provider not in ('phone', 'in_person');

alter table core.candidate_interview_slot
  alter column meeting_provider set default 'phone',
  drop constraint if exists candidate_interview_slot_provider_ck;
alter table core.candidate_interview_slot
  add constraint candidate_interview_slot_provider_ck check (
    meeting_provider in ('phone', 'in_person')
  );

alter table core.candidate_interview
  alter column meeting_provider set default 'phone',
  drop constraint if exists candidate_interview_provider_ck;
alter table core.candidate_interview
  add constraint candidate_interview_provider_ck check (
    meeting_provider in ('phone', 'in_person')
  );

comment on column core.candidate_interview_slot.meeting_provider is
  'Operational interview format. Current supported values are phone and in_person.';
comment on column core.candidate_interview.meeting_provider is
  'Operational interview format. Current supported values are phone and in_person.';

commit;
