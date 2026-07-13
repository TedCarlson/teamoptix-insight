begin;

with sow_document as (
  insert into legal.document (
    document_key,
    title,
    version_major,
    version_minor,
    version_patch,
    status,
    current_version,
    owner_name,
    updated_at
  )
  values (
    'STATEMENT_OF_WORK',
    'Statement of Work',
    0,
    2,
    0,
    'DRAFT',
    '0.2.0',
    'Team Optix Business',
    now()
  )
  on conflict (document_key) do update
  set
    title = excluded.title,
    version_major = excluded.version_major,
    version_minor = excluded.version_minor,
    version_patch = excluded.version_patch,
    status = 'DRAFT',
    current_version = excluded.current_version,
    owner_name = excluded.owner_name,
    updated_at = now()
  returning id
)
delete from legal.document_section section
using sow_document document
where section.document_id = document.id;

with sow_document as (
  select id
  from legal.document
  where document_key = 'STATEMENT_OF_WORK'
)
insert into legal.document_section (
  document_id,
  section_number,
  section_key,
  title,
  summary,
  body_markdown,
  status,
  workflow_status
)
select
  sow_document.id,
  seed.section_number,
  seed.section_key,
  seed.title,
  seed.summary,
  seed.body_markdown,
  'DRAFT',
  'DRAFT'
from sow_document
cross join (
  values
    (
      1,
      'project-overview',
      'Project Overview',
      'Implementation purpose and launch context.',
      $md$Project: Team Optix Insight Implementation  
Customer: [Customer Legal Name]  
Provider: Team Optix, LLC  
Effective Date: [Date]  
Project Leads: [Customer Lead] / [Team Optix Lead]

This Statement of Work describes how Team Optix will help Customer configure, validate, and launch the Insight surfaces included in Customer's subscription.

The purpose of the implementation is to make Insight usable as a practical operating workspace for Customer's daily workflows across people, assets, routes, operations, schedules, payroll review, timekeeping review, analytics, reporting, and related administrative surfaces.$md$
    ),
    (
      2,
      'scope-of-work',
      'Scope of Work',
      'Subscribed implementation workstreams and scope boundary.',
      $md$Team Optix will support Customer through the implementation of the subscribed Insight surfaces. The implementation may include the following workstreams, depending on Customer's subscription and launch plan:

- Company workspace and access setup
- People, roster, and hiring readiness
- Asset management setup
- Route and operations configuration
- Report intake and data freshness validation
- Schedule and time-off workflow setup
- Payroll and timekeeping review setup
- Analytics and reporting orientation
- Driver and mobile user enablement, if included
- Admin and configuration handoff
- Go-live readiness review
- Post-go-live issue tracking and stabilization

The scope of this SOW is limited to implementation, configuration, onboarding, validation, and handoff for subscribed Insight surfaces. Custom development, unlisted integrations, payroll processing, tax advice, accounting services, and legal advice are excluded unless separately agreed in writing.$md$
    ),
    (
      3,
      'customer-workspace-setup',
      'Customer Workspace Setup',
      'Workspace, company profile, role, and launch-user setup.',
      $md$Team Optix will configure the Customer workspace, company profile, and initial access structure so authorized Customer users can access the subscribed Insight surfaces.

This may include workspace creation, company profile setup, role alignment, navigation review, initial user access configuration, and confirmation that the launch group can reach the appropriate surfaces.

Customer is responsible for identifying authorized users, confirming user roles, and determining which internal personnel should have access to administrative, operational, payroll, schedule, driver, or leadership surfaces.$md$
    ),
    (
      4,
      'people-roster-hiring-readiness',
      'People, Roster, and Hiring Readiness',
      'Initial workforce record loading, validation, and ownership boundary.',
      $md$Team Optix will support initial people and roster setup so Customer can manage workforce records in Insight.

This may include loading or validating active personnel, former personnel, candidates, driver records, role assignments, identifiers, employment status, and related roster details where those surfaces are included in Customer's subscription.

Customer remains responsible for the accuracy, completeness, and legality of its workforce data and for all internal employment, staffing, hiring, termination, and compliance decisions.$md$
    ),
    (
      5,
      'asset-management-setup',
      'Asset Management Setup',
      'Asset surfaces, loading, assignment, and reconciliation setup.',
      $md$Where asset management is included, Team Optix will configure the applicable asset surfaces and support initial asset loading.

This may include scanners, fuel cards, assigned assets, asset statuses, assignment history, and basic reconciliation workflows available in Insight.

Customer remains responsible for internal asset ownership decisions, physical asset control, inventory accuracy, replacement decisions, employee accountability, and any financial or operational actions related to assets.$md$
    ),
    (
      6,
      'route-operations-configuration',
      'Route and Operations Configuration',
      'Route, dispatch, service, planning, and operations view setup.',
      $md$Team Optix will configure applicable route and operations surfaces so Customer can review operational information inside Insight.

This may include route setup, route labels, route identity mapping, dispatch-related surfaces, service-related views, planning surfaces, delivery-window views, prior-day operational review, and other subscribed operations tools.

Customer remains responsible for its own operational decisions, dispatch decisions, staffing decisions, service decisions, safety decisions, and customer-service decisions.$md$
    ),
    (
      7,
      'report-intake-data-freshness',
      'Report Intake and Data Freshness',
      'Source report intake, status, freshness, and missing-data visibility.',
      $md$Team Optix will configure supported report intake workflows so Customer can provide required source reports and review available operating data in Insight.

This may include setup for manual uploads, operational service capture, report history, data freshness indicators, missing-data indicators, source-file visibility, and status messaging.

Team Optix will help Customer understand whether expected reports are present, missing, stale, incomplete, or ready for review. Customer remains responsible for providing source data, maintaining access to required systems, validating source accuracy, and making business decisions based on its own judgment.$md$
    ),
    (
      8,
      'schedule-time-off-workflows',
      'Schedule and Time-Off Workflows',
      'Schedule coverage, baseline, override, and time-off setup.',
      $md$Where included, Team Optix will configure schedule surfaces so Customer can review scheduled coverage, manage supported baseline schedules, review schedule changes, and make schedule information available to authorized users.

Where time-off workflows are enabled, Team Optix may help configure supported request, review, approval, denial, or visibility workflows.

Customer remains responsible for all staffing decisions, time-off decisions, attendance policies, labor compliance, employee communications, and operational coverage decisions.$md$
    ),
    (
      9,
      'payroll-timekeeping-review',
      'Payroll and Timekeeping Review',
      'Payroll visibility, review, adjustment, and timekeeping oversight setup.',
      $md$Where included, Team Optix will configure payroll and timekeeping review surfaces so Customer can inspect payroll-related records, review mismatches, manage supported adjustments, and complete internal payroll review workflows.

Insight may support payroll review, payroll visibility, adjustment tracking, timekeeping oversight, and discrepancy review. Team Optix does not provide payroll processing, tax advice, accounting services, legal advice, wage-and-hour advice, or final payroll authorization.

Customer remains solely responsible for payroll decisions, wage calculations, tax filings, employee classifications, payroll compliance, accounting entries, and payments to employees or contractors.$md$
    ),
    (
      10,
      'analytics-reporting-orientation',
      'Analytics and Reporting Orientation',
      'Analytics onboarding and decision-support boundary.',
      $md$Team Optix will enable subscribed analytics and reporting surfaces and provide onboarding so Customer can interpret available operational, workforce, route, historical, commercial, and export views.

Analytics in Insight are decision-support tools. They may depend on source reports, Customer-provided data, historical records, configuration choices, and available system activity.

Customer understands that analytics are not a substitute for management judgment, professional advice, legal review, payroll review, accounting review, or operational responsibility.$md$
    ),
    (
      11,
      'driver-mobile-user-enablement',
      'Driver and Mobile User Enablement',
      'Driver-facing and mobile workflow setup where included.',
      $md$Where driver-facing or mobile surfaces are included, Team Optix will support initial setup and provide Customer guidance so authorized users can access supported mobile workflows.

This may include schedule visibility, message center access, scorecard visibility, time-off requests, timekeeping correction workflows, or other subscribed driver-facing surfaces.

Customer remains responsible for internal policy, employee training, driver communications, device usage expectations, labor compliance, and any operational decisions made from mobile-user activity.$md$
    ),
    (
      12,
      'admin-configuration-handoff',
      'Admin and Configuration Handoff',
      'Admin training and ownership split for configuration settings.',
      $md$Team Optix will train authorized Customer users on the configuration surfaces available under Customer's subscription.

Team Optix will identify which settings are managed by Customer and which settings are managed by Team Optix. Team Optix may provide handoff notes for routine administration, launch configuration, known limitations, and post-go-live support expectations.

Customer is responsible for maintaining internal administrative discipline, reviewing configuration changes, managing authorized users, and communicating internal policies to its personnel.$md$
    ),
    (
      13,
      'go-live-readiness-review',
      'Go-Live Readiness Review',
      'Launch-readiness review for subscribed surfaces and known risks.',
      $md$Team Optix will conduct a go-live readiness review to confirm that the subscribed surfaces, user access, key workflows, and required data sources are ready for initial production use.

The readiness review may include workspace access, roster setup, asset setup, route setup, report intake, operational views, schedule workflows, payroll/timekeeping review, analytics surfaces, admin handoff, and known launch risks.

Customer will make the final go-live decision based on its own operational needs. Team Optix may identify readiness blockers, warnings, or follow-up items, but Customer remains responsible for deciding when it is ready to use Insight in production.$md$
    ),
    (
      14,
      'deliverables',
      'Deliverables',
      'Implementation outputs for the agreed launch scope.',
      $md$The implementation deliverables may include:

- Customer workspace setup
- Initial user access setup
- People and roster setup for the agreed launch group
- Asset setup for the agreed launch group, if applicable
- Route setup and validation, if applicable
- Report intake workflows for agreed source reports
- Data freshness and status rules
- Schedule and time-off workflow setup, if applicable
- Payroll and timekeeping review setup, if applicable
- Analytics orientation
- Driver or mobile user enablement, if applicable
- Admin handoff
- Go-live readiness review
- Launch issue tracker or stabilization notes

Deliverables are limited to the subscribed Insight surfaces and any additional scope specifically agreed in writing.$md$
    ),
    (
      15,
      'customer-responsibilities',
      'Customer Responsibilities',
      'Customer data, access, validation, decision, and training obligations.',
      $md$Customer will provide timely access to required source data, systems, users, decision-makers, sample files, reports, credentials, configuration information, and approvals.

Customer will review configurations, validate outputs, confirm user access, test workflows, and make internal business, staffing, payroll, operational, compliance, and administrative decisions.

Customer is responsible for training its own users on company policy, operational procedures, payroll procedures, timekeeping expectations, employee responsibilities, safety practices, and internal decision-making standards.$md$
    ),
    (
      16,
      'assumptions',
      'Assumptions',
      'Implementation assumptions around access, data, approvals, and subscribed surfaces.',
      $md$This SOW assumes Customer will provide the information, data, approvals, and access needed to complete implementation.

This SOW also assumes that the subscribed Insight surfaces are limited to the products, modules, workspaces, and features listed in the applicable order form, commercial schedule, subscription plan, or written agreement.

Implementation timelines may depend on Customer responsiveness, data quality, source-system access, required approvals, user availability, and the condition of Customer's existing records.$md$
    ),
    (
      17,
      'exclusions',
      'Exclusions',
      'Work and professional services excluded unless separately agreed.',
      $md$Unless separately agreed in writing, this SOW does not include:

- Custom feature development
- Custom third-party integration buildouts
- Payroll processing
- Tax advice
- Accounting services
- Legal advice
- Wage-and-hour advice
- Human resources consulting
- Safety consulting
- Managed dispatch services
- Managed operations services
- Data correction outside agreed implementation scope
- Historical data cleanup outside agreed launch requirements
- Support for systems, vendors, or platforms not included in the subscription
- Work beyond the subscribed Insight surfaces$md$
    ),
    (
      18,
      'timeline',
      'Timeline',
      'General implementation phases and schedule dependency.',
      $md$Implementation will generally move through the following phases:

1. Workspace and access setup
2. Data intake and configuration
3. Workflow validation
4. Training and go-live readiness
5. Post-go-live stabilization

Specific dates, deadlines, milestones, or launch windows may be added in a project schedule, order form, onboarding plan, or written implementation plan.$md$
    ),
    (
      19,
      'fees-and-payment',
      'Fees and Payment',
      'Implementation fee, subscription fee, invoice, and out-of-scope approval language.',
      $md$Customer will pay the implementation fee and any subscription or recurring fees stated in the applicable order form, commercial schedule, invoice, or agreement.

Any out-of-scope work must be approved in writing before it is performed. Unless otherwise stated in the applicable agreement or invoice, invoices are due within thirty days.$md$
    ),
    (
      20,
      'change-requests',
      'Change Requests',
      'Process for scope, timeline, fee, or deliverable changes.',
      $md$If Customer requests work outside the agreed scope, Team Optix will document the requested change and confirm any impact to timeline, fees, deliverables, or support expectations before proceeding.

Small clarifications may be handled by the project leads if they do not materially change scope, cost, timeline, or deliverables.$md$
    ),
    (
      21,
      'support-and-stabilization',
      'Support and Stabilization',
      'Implementation support and post-go-live support handoff.',
      $md$During implementation, Team Optix will provide support according to the agreed implementation support process.

After go-live, ongoing support will follow the Master Service Agreement, support policy, order form, subscription terms, or other applicable written agreement.

Post-go-live stabilization may include issue tracking, workflow clarification, minor configuration follow-up, and launch-support review for the subscribed Insight surfaces.$md$
    ),
    (
      22,
      'order-of-precedence',
      'Order of Precedence',
      'Relationship between this SOW, the MSA, and other commercial documents.',
      $md$This SOW works together with the Master Service Agreement and any applicable order form, commercial schedule, subscription terms, support policy, or written agreement between the parties.

If there is a conflict between this SOW and the Master Service Agreement, the Master Service Agreement controls unless this SOW specifically states otherwise.$md$
    ),
    (
      23,
      'acceptance',
      'Acceptance',
      'Customer acknowledgment of scope and implementation start authority.',
      $md$By signing or electronically accepting this SOW, Customer acknowledges that it has reviewed the scope, responsibilities, assumptions, exclusions, timeline, fees, and implementation process described in this SOW.

Customer further acknowledges that Team Optix may rely on this acceptance to begin or continue implementation work for the subscribed Insight surfaces.$md$
    ),
    (
      24,
      'signatures',
      'Signatures',
      'Signature block for Team Optix and Customer.',
      $md$Team Optix, LLC

By: _______________________________  
Name: _____________________________  
Title: ______________________________  
Date: ______________________________

Customer

By: _______________________________  
Name: _____________________________  
Title: ______________________________  
Date: ______________________________$md$
    )
) as seed(section_number, section_key, title, summary, body_markdown);

commit;
