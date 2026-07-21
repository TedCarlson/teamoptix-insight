-- DSW reports use AM/PM frames. FCC Work Area Summary is a distinct, valid
-- frame introduced by the governed FCC staging contract.

alter table core.operations_report_batch
  drop constraint if exists operations_report_batch_report_frame_check;

alter table core.operations_report_batch
  add constraint operations_report_batch_report_frame_check
  check (
    report_frame is null
    or report_frame in ('AM', 'PM', 'WORK_AREA_SUMMARY')
  );

notify pgrst, 'reload schema';
