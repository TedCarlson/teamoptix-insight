-- security_invoker views require the caller to read their underlying relations.
grant select on table ref.industries, ref.insight_capabilities to service_role;
grant select on table core.lob_capability, core.intake_question,
  core.intake_question_lob, core.intake_question_capability,
  core.workspace_request to service_role;
