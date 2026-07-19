begin;

insert into legal.document (
    document_key,
    title,
    version_major,
    version_minor,
    version_patch,
    status,
    current_version,
    owner_name,
    document_scope,
    provider_name,
    updated_at
  )
  values (
    'DATA_PROCESSING_ADDENDUM',
    'Data Processing Addendum',
    0,
    2,
    0,
    'DRAFT',
    '0.2.0',
    'Team Optix Business',
    'TEMPLATE',
    'Team Optix, LLC',
    now()
  )
  on conflict (document_key) do update
  set
    title = excluded.title,
    status = 'DRAFT',
    owner_name = excluded.owner_name,
    document_scope = 'TEMPLATE',
    provider_name = excluded.provider_name,
    updated_at = now()
  ;

update legal.document_section section
set section_key = case section.section_key
  when 'overview' then 'overview-and-scope'
  when 'processing-activities' then 'definitions'
  when 'security-measures' then 'roles-and-instructions'
  else section.section_key
end
where section.document_id = (
  select id from legal.document where document_key = 'DATA_PROCESSING_ADDENDUM'
)
and section.section_key in ('overview', 'processing-activities', 'security-measures');

update legal.document_section section
set
  section_number = section.section_number + 1000,
  status = 'ARCHIVED',
  workflow_status = 'ARCHIVED',
  updated_at = now()
where section.document_id = (
  select id from legal.document where document_key = 'DATA_PROCESSING_ADDENDUM'
)
and section.section_key not in (
  'overview-and-scope', 'definitions', 'roles-and-instructions', 'processing-particulars',
  'ownership-and-control', 'prohibited-uses', 'carrier-data-minimization',
  'seven-day-operational-retention', 'mandatory-transformation', 'transformed-analytical-data',
  'confidentiality-and-access', 'security-measures', 'subprocessors',
  'data-subject-and-regulatory-assistance', 'security-incidents',
  'return-export-and-deletion', 'audit-and-compliance-evidence',
  'compelled-disclosure-and-transfers', 'customer-responsibilities',
  'annex-a-processing-description', 'annex-b-security-and-subprocessors'
);

with dpa_sections(section_number, section_key, title, summary, body_markdown) as (
  values
    (
      1,
      'overview-and-scope',
      'Overview and Scope',
      'Purpose, parties, relationship to the services, and order of precedence.',
      $md$This Data Processing Addendum ("DPA") forms part of the agreement between [Customer Legal Name] ("Customer") and Team Optix, LLC ("TeamOptix") governing Customer's use of Insight and related services (the "Agreement"). It applies when TeamOptix processes Customer Data on Customer's behalf.

Insight is an operational toolkit designed to support Customer's authorized business operations. Customer Data is processed only to deliver, support, secure, and maintain the services selected by Customer. Customer Data is not inventory, advertising material, training material, or a commercial asset of TeamOptix.

If this DPA conflicts with the Agreement concerning the processing, protection, retention, return, or deletion of Customer Data, this DPA controls to the extent of that conflict. Applicable law controls over both documents.$md$
    ),
    (
      2,
      'definitions',
      'Definitions',
      'Defined terms used throughout the DPA.',
      $md$**Applicable Data Protection Law** means privacy, data-protection, breach-notification, and information-security law applicable to the processing covered by this DPA.

**Carrier Operational Data** means information supplied or authorized by Customer concerning carrier operations, including routes, stops, packages, recipients, addresses, service activity, drivers, vehicles, manifests, reports, and related operational records.

**Customer Data** means information submitted to, collected by, generated for, or otherwise processed through Insight on Customer's behalf, including Carrier Operational Data and Personal Data. Customer Data does not include TeamOptix account, billing, security, or platform telemetry that does not contain Customer content and cannot reasonably reconstruct Customer operations.

**Personal Data** means information relating to an identified or reasonably identifiable natural person and includes "personal information" and similar terms under Applicable Data Protection Law.

**Security Incident** means confirmed unauthorized access to, acquisition of, disclosure of, alteration of, loss of, or destruction of Customer Data. Unsuccessful attempts that do not compromise Customer Data are not Security Incidents.

**Subprocessor** means a third party engaged by TeamOptix to process Customer Data solely to provide the services.

**Transformed Analytical Data** means limited operational data retained after the mandatory transformation described in this DPA and subject to the restrictions stated here.$md$
    ),
    (
      3,
      'roles-and-instructions',
      'Roles and Documented Instructions',
      'Customer authority and TeamOptix processor obligations.',
      $md$As between the parties, Customer determines the purposes of processing and is the controller, business, or equivalent responsible party. TeamOptix acts as Customer's processor, service provider, or contractor.

TeamOptix will process Customer Data only on Customer's documented instructions, including the Agreement, Customer's configuration and use of Insight, authorized support requests, and other written directions consistent with the services. TeamOptix will promptly inform Customer if, in TeamOptix's reasonable opinion, an instruction violates Applicable Data Protection Law, unless prohibited by law.

TeamOptix will not determine an independent purpose for Customer Data. Processing required by law is permitted only to the extent legally required and subject to the compelled-disclosure provisions of this DPA.$md$
    ),
    (
      4,
      'processing-particulars',
      'Processing Particulars',
      'Subject matter, duration, nature, purpose, people, and data categories.',
      $md$The subject matter of processing is the delivery of the Insight services selected by Customer. Processing lasts for the term of the Agreement plus the limited return, deletion, backup, and legal-hold periods stated in this DPA.

Processing activities may include receiving, validating, organizing, displaying, calculating, comparing, reporting, transmitting, securing, backing up, transforming, exporting, and deleting Customer Data. The purposes are limited to Customer-authorized operational administration, workforce support, dispatch, service review, fleet readiness, scheduling, compliance, reporting, analytics, troubleshooting, support, security, and service continuity.

Data subjects may include Customer personnel, applicants, contractors, drivers, authorized users, delivery recipients, customer contacts, and other people whose information Customer lawfully provides. Data categories may include identity and contact data, employment and schedule data, operational identifiers, route and stop data, package and service facts, addresses, geolocation where enabled, inspection evidence, access records, and support communications.

Customer will not provide categories of data that are unnecessary for the selected services or prohibited by the Agreement.$md$
    ),
    (
      5,
      'ownership-and-control',
      'Customer Ownership and Control',
      'Customer rights and TeamOptix limited processing permission.',
      $md$As between the parties, Customer retains all rights in Customer Data. No ownership interest in Customer Data transfers to TeamOptix.

Customer grants TeamOptix only the limited, nonexclusive permission necessary to process Customer Data in accordance with this DPA and the Agreement. TeamOptix will not assert a lien over Customer Data, condition an authorized export on the grant of additional data rights, or use Customer Data to compete with, commercially characterize, or independently evaluate Customer.

Customer controls its authorized users, configurations, source submissions, operational decisions, retention instructions where configurable, and lawful use of exported information.$md$
    ),
    (
      6,
      'prohibited-uses',
      'Prohibited Uses and No Sale or Sharing',
      'Absolute restrictions against secondary commercial exploitation.',
      $md$TeamOptix will not sell, rent, license, release, disclose, disseminate, make available, exchange, or otherwise transfer Customer Data for monetary or other valuable consideration.

TeamOptix will not "sell" or "share" Personal Data as those terms are defined by Applicable Data Protection Law, including sharing for cross-context behavioral advertising. TeamOptix will not use Customer Data for advertising, lead generation, data brokerage, unrelated marketing, recipient profiling, credit or eligibility decisions, or another party's independent purpose.

TeamOptix will not combine Customer Data with data received from another customer or collected from TeamOptix's independent interaction with a person, except when technically necessary to provide a Customer-requested feature and permitted by law. Customer Data will not be used to create an externally marketed benchmark or commercially exploitable dataset.

TeamOptix will not train, fine-tune, or improve a general-purpose or shared artificial-intelligence or machine-learning model using Customer Data. Customer-specific AI processing is permitted only when Customer intentionally invokes an included feature, the processing is necessary to return the requested result, and every provider involved is an approved Subprocessor contractually prohibited from using Customer Data for model training or its own purposes.$md$
    ),
    (
      7,
      'carrier-data-minimization',
      'Carrier Data Minimization',
      'Restricted collection and no independent carrier intelligence.',
      $md$TeamOptix will process Carrier Operational Data only to the extent supplied or authorized by Customer and reasonably necessary for Customer's selected Insight services.

TeamOptix does not independently acquire, scrape, purchase, broker, enrich, or maintain datasets concerning FedEx or another carrier's routes, stops, packages, recipients, addresses, delivery activity, or service metrics. Without Customer-authorized inputs, Insight provides no operational intelligence concerning Customer's carrier operations.

Insight creates no entitlement for TeamOptix or Customer to obtain, retain, or use carrier information beyond Customer's authority as an authorized operator or agent. Customer is responsible for ensuring that its submission and instructed use of Carrier Operational Data comply with its applicable carrier agreements, policies, and authority.$md$
    ),
    (
      8,
      'seven-day-operational-retention',
      'Seven-Day Operational Retention',
      'Short identifiable-data window measured from the service date.',
      $md$TeamOptix may retain identifiable stop-, package-, recipient-, and address-level Carrier Operational Data for no more than seven calendar days following the applicable service date.

The seven-day period is measured from the service date represented by the underlying operational activity, not from a filename, object-storage path, upload time, file-creation time, download time, ingestion time, or report-generation time.

During this period, identifiable Carrier Operational Data may be used only for in-day operations, operational reconciliation, exception investigation, service review, compliance validation, Customer-authorized reporting, and correction of ingestion or processing errors. This provision does not authorize retention of data that is unnecessary for those purposes.$md$
    ),
    (
      9,
      'mandatory-transformation',
      'Mandatory Transformation After Seven Days',
      'Required deletion and mutation of delivery-level identifiers.',
      $md$No later than expiration of the seven-day operational period, TeamOptix will delete source artifacts and remove or irreversibly transform fields reasonably capable of identifying or reconstructing a recipient, household, complete address, package, stop, or delivery event.

The transformation must remove, when present: recipient and contact names; street, apartment, suite, and unit information; telephone numbers; email addresses; tracking numbers; package identifiers and barcodes; source-manifest identifiers; delivery instructions and free-text notes; signatures; proof-of-delivery photographs; precise coordinates; and other direct delivery-level identifiers.

A complete delivery address may be reduced to a postal-code-only string. Source reports, manifests, images, and evidence artifacts containing identifiable delivery data must be deleted according to the same deadline unless Customer directs earlier deletion or a documented legal preservation obligation applies.

Backups containing expired identifiable Carrier Operational Data will remain isolated from ordinary use and will expire through the documented backup lifecycle. Restored backups must be subjected to the same transformation or deletion controls before operational use.$md$
    ),
    (
      10,
      'transformed-analytical-data',
      'Transformed Analytical Data',
      'Permitted customer-serving analytics and strict non-reidentification rules.',
      $md$Following mandatory transformation, TeamOptix may retain limited Transformed Analytical Data solely to produce and maintain customer-serving operational analytics within Insight.

Permitted retained facts may include service date, postal code, generalized stop type, package count, exception class, route category, and performance measurements, provided the retained combination cannot reasonably reconstruct a person, household, complete address, package, tracking identifier, source manifest, or individual delivery event.

TeamOptix will not reidentify, reconstruct, or relink Transformed Analytical Data. TeamOptix will not combine it across customers for external benchmarking, disclose it externally, sell it, license it, monetize it, use it for advertising or data brokerage, or use it for general-purpose AI training.

Postal code is not treated as automatically anonymous. TeamOptix will apply further aggregation, suppression, access restrictions, or deletion when a postal code, time, route, event, or other combination creates a reasonable reidentification risk.$md$
    ),
    (
      11,
      'confidentiality-and-access',
      'Confidentiality and Access Control',
      'Restricted privileged access for authorized users and personnel.',
      $md$TeamOptix will ensure that personnel authorized to process Customer Data are bound by confidentiality obligations and receive access only when required for their assigned responsibilities.

TeamOptix will maintain role-based access controls, authentication controls, least-privilege assignments, and administrative safeguards appropriate to the sensitivity of Customer Data. Privileged access will be restricted, attributable to an authorized identity, and reviewable through available logs or administrative records.

Customer is responsible for authorizing its users and agents, assigning appropriate privileges, protecting credentials, promptly removing access that is no longer required, and notifying TeamOptix of suspected unauthorized access.$md$
    ),
    (
      12,
      'security-measures',
      'Security Measures',
      'Administrative, technical, and organizational safeguards.',
      $md$TeamOptix will maintain reasonable and appropriate administrative, technical, and organizational safeguards designed to protect the confidentiality, integrity, availability, and resilience of Customer Data.

Safeguards will include, as appropriate to the services and risk: encryption in transit and at rest; access control and multifactor authentication for privileged access; secure credential and secret management; environment separation; logging and monitoring; vulnerability and dependency management; backup and recovery controls; incident response procedures; personnel confidentiality; change management; vendor review; and secure deletion or transformation controls.

TeamOptix may update safeguards as technology and risk evolve, provided the overall protection of Customer Data is not materially reduced during the term.$md$
    ),
    (
      13,
      'subprocessors',
      'Subprocessors',
      'Controlled operational disclosure and downstream obligations.',
      $md$TeamOptix may use Subprocessors only when reasonably necessary to provide, secure, support, or maintain the services. Disclosure to a Subprocessor is not permission for that Subprocessor to use Customer Data for its own purposes.

Each Subprocessor with access to Customer Data must be bound by a written agreement imposing confidentiality, security, use restriction, deletion, and data-protection obligations no less protective than the relevant obligations in this DPA. TeamOptix remains responsible for the Subprocessor's performance of those obligations to the extent required by law and the Agreement.

TeamOptix will maintain a current Subprocessor register and provide reasonable advance notice of a material addition or replacement. Customer may object on reasonable data-protection grounds. The parties will work in good faith to resolve the objection; if no reasonable alternative is available, the Agreement will govern the affected service.$md$
    ),
    (
      14,
      'data-subject-and-regulatory-assistance',
      'Rights and Compliance Assistance',
      'Support for lawful requests, assessments, and regulator obligations.',
      $md$Taking into account the nature of processing and information available to TeamOptix, TeamOptix will reasonably assist Customer with verified requests concerning access, correction, deletion, portability, restriction, or objection when Customer cannot fulfill the request using available service functionality.

TeamOptix will reasonably assist Customer with security, breach-notification, impact-assessment, and regulator-consultation obligations applicable to TeamOptix's processing. Customer remains responsible for determining whether and how to respond to a request, for communicating with data subjects and regulators, and for ensuring the lawfulness of its processing instructions.

If TeamOptix receives a request directly concerning Customer Data, TeamOptix will refer the requester to Customer unless law requires a different response.$md$
    ),
    (
      15,
      'security-incidents',
      'Security Incident Response',
      'Notice, containment, investigation, and cooperation duties.',
      $md$TeamOptix will notify Customer without undue delay after confirming a Security Incident affecting Customer Data and, where reasonably practicable, within forty-eight hours after confirmation.

Notice will include information then available concerning the nature of the incident, affected systems and data, likely consequences, containment and remediation measures, and a contact for follow-up. TeamOptix may provide information in phases as the investigation develops.

TeamOptix will take reasonable steps to contain, investigate, remediate, and prevent recurrence; preserve relevant evidence; and cooperate with Customer's lawful response. Notice is not an admission of fault or liability. Customer is responsible for notices or reports to individuals, customers, carriers, regulators, or authorities unless the parties agree otherwise in writing.$md$
    ),
    (
      16,
      'return-export-and-deletion',
      'Return, Export, and Deletion',
      'Customer access, termination handling, and verified disposal.',
      $md$During the term, Customer may export Customer Data using available service functionality or a reasonable supported process. Upon termination or Customer's lawful written instruction, TeamOptix will return or delete Customer Data, subject to the seven-day Carrier Operational Data limit, documented backup expiration, and legal preservation requirements.

TeamOptix will not retain Customer Data to create leverage, develop an unrelated product, or obtain additional data rights. Data retained solely because of law, legal hold, or isolated backup requirements will remain protected, inaccessible for ordinary business use, and deleted when the applicable requirement expires.

Upon reasonable request, TeamOptix will provide confirmation of completed deletion or transformation based on its records and controls.$md$
    ),
    (
      17,
      'audit-and-compliance-evidence',
      'Audit and Compliance Evidence',
      'Proportionate evidence, assessments, and inspection rights.',
      $md$TeamOptix will make available information reasonably necessary to demonstrate compliance with this DPA, which may include policies, control descriptions, Subprocessor information, retention-control evidence, security summaries, or relevant independent assessments when available.

If that information is insufficient, Customer may request a reasonable audit concerning TeamOptix's processing of Customer Data. Audits must be scoped to applicable obligations, protect other customers and confidential systems, avoid unreasonable disruption, and ordinarily occur no more than once in a twelve-month period unless a Security Incident or regulator requires otherwise.

The parties will agree on timing, scope, confidentiality, and allocation of reasonable costs before an inspection.$md$
    ),
    (
      18,
      'compelled-disclosure-and-transfers',
      'Compelled Disclosure and Data Transfers',
      'Government demands and lawful cross-border safeguards.',
      $md$If TeamOptix is legally compelled to disclose Customer Data, TeamOptix will, unless prohibited by law, notify Customer before disclosure, provide available details, and reasonably assist Customer in seeking protective treatment. TeamOptix will challenge requests it reasonably believes are unlawful or materially overbroad when a lawful and commercially reasonable basis exists.

TeamOptix will disclose only the Customer Data legally required and will document the demand and response where permitted.

TeamOptix will not transfer Personal Data across national borders except as necessary to provide the services and in compliance with Applicable Data Protection Law. Where a transfer mechanism is legally required, the parties will implement the applicable standard contractual clauses or another valid safeguard.$md$
    ),
    (
      19,
      'customer-responsibilities',
      'Customer Responsibilities',
      'Lawful authority, notices, source controls, and operational accountability.',
      $md$Customer represents that it has the rights, notices, permissions, instructions, and lawful authority necessary for TeamOptix to process Customer Data as contemplated by the Agreement and this DPA.

Customer will limit submissions to data reasonably necessary for the selected services; configure and use Insight lawfully; maintain appropriate source-system and user controls; review outputs before relying on them; and comply with applicable carrier agreements, employment obligations, privacy requirements, and operational policies.

Customer will not instruct TeamOptix to process data for unlawful discrimination, unauthorized surveillance, unrelated advertising, data brokerage, or another prohibited purpose. TeamOptix may suspend an instruction that creates a material security or legal risk while the parties address the issue.$md$
    ),
    (
      20,
      'annex-a-processing-description',
      'Annex A — Processing Description',
      'Customer-specific processing schedule completed for each client document.',
      $md$**Customer:** [Customer Legal Name]  
**Provider:** Team Optix, LLC  
**Effective Date:** [Date]  
**Services:** Insight operational toolkit and the subscribed workspaces identified in the Agreement or Statement of Work.  
**Processing Duration:** Agreement term plus limited return, deletion, backup, and legal-hold periods.  
**Processing Frequency:** As initiated by Customer, authorized users, configured automation, or scheduled service operation.  
**Data Subjects:** Customer personnel, applicants, contractors, drivers, authorized users, delivery recipients, customer contacts, and other authorized individuals.  
**Data Categories:** Account, identity, contact, workforce, schedule, route, stop, package, service, vehicle, inspection, compliance, access-log, and support data applicable to subscribed services.  
**Sensitive Data:** Only as specifically required for subscribed features and lawfully supplied by Customer. Customer should not submit unnecessary sensitive data.  
**Carrier Operational Retention:** Identifiable delivery-level data retained no more than seven calendar days from service date, followed by mandatory deletion or transformation under this DPA.  
**Special Instructions:** [Customer-specific processing instructions, restrictions, or approved exceptions].$md$
    ),
    (
      21,
      'annex-b-security-and-subprocessors',
      'Annex B — Security and Subprocessor Register',
      'Living schedule of safeguards and approved operational providers.',
      $md$### Technical and Organizational Measures

- Role-based and least-privilege access
- Multifactor authentication for privileged access where supported
- Encryption in transit and at rest
- Secure secrets and credential handling
- Production environment and tenant access controls
- Logging, monitoring, and incident response
- Vulnerability, dependency, and change management
- Backup, recovery, retention, transformation, and deletion controls
- Personnel confidentiality and restricted administrative access
- Vendor diligence and written downstream data-protection terms

### Subprocessor Register

Before publication, TeamOptix will identify each production Subprocessor that may process Customer Data, its service function, processing location where applicable, and the categories of data involved. The register must distinguish infrastructure required to operate Insight from providers that receive no Customer Data.

No listed Subprocessor receives permission to sell, share, advertise with, train models on, combine, or otherwise use Customer Data for its own independent purposes.$md$
    )
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
  document.id,
  dpa_sections.section_number,
  dpa_sections.section_key,
  dpa_sections.title,
  dpa_sections.summary,
  dpa_sections.body_markdown,
  'DRAFT',
  'DRAFT'
from legal.document document
cross join dpa_sections
where document.document_key = 'DATA_PROCESSING_ADDENDUM'
on conflict (document_id, section_key) do update
set
  section_number = excluded.section_number,
  title = excluded.title,
  summary = excluded.summary,
  body_markdown = excluded.body_markdown,
  status = 'DRAFT',
  workflow_status = 'DRAFT',
  updated_at = now();

update legal.document
set
  version_major = 0,
  version_minor = 2,
  version_patch = 0,
  current_version = '0.2.0',
  status = 'DRAFT',
  last_reviewed_at = null,
  published_at = null,
  updated_at = now()
where document_key = 'DATA_PROCESSING_ADDENDUM';

commit;
