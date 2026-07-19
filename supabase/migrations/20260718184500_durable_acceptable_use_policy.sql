begin;

insert into legal.document (
  document_key, title, version_major, version_minor, version_patch, status,
  current_version, owner_name, document_scope, provider_name, updated_at
)
values (
  'ACCEPTABLE_USE_POLICY', 'Acceptable Use Policy', 0, 2, 0, 'DRAFT',
  '0.2.0', 'Team Optix Business', 'TEMPLATE', 'Team Optix, LLC', now()
)
on conflict (document_key) do update
set
  title = excluded.title,
  status = 'DRAFT',
  owner_name = excluded.owner_name,
  document_scope = 'TEMPLATE',
  provider_name = excluded.provider_name,
  updated_at = now();

with existing_sections as (
  select
    section.id,
    row_number() over (order by section.section_number, section.created_at, section.id) as legacy_number
  from legal.document_section section
  where section.document_id = (
    select id from legal.document where document_key = 'ACCEPTABLE_USE_POLICY'
  )
)
update legal.document_section section
set
  section_number = -existing_sections.legacy_number,
  section_key = 'legacy-aup-' || section.id::text,
  status = 'ARCHIVED',
  workflow_status = 'ARCHIVED',
  updated_at = now()
from existing_sections
where section.id = existing_sections.id;

with aup_sections(section_number, section_key, title, summary, body_markdown) as (
  values
    (
      1,
      'purpose-and-scope',
      'Purpose and Scope',
      'Who and what the policy governs.',
      $md$This Acceptable Use Policy ("AUP") forms part of the agreement between [Customer Legal Name] ("Customer") and Team Optix, LLC ("TeamOptix") governing Customer's use of Insight and related services (the "Agreement"). It applies to Customer, its authorized users, administrators, employees, contractors, agents, integrations, devices, and anyone using the services through Customer's account.

Insight is an operational toolkit provided to support authorized client operations. This AUP establishes the boundaries necessary to protect Customer, other customers, affected individuals, carrier relationships, the services, and the integrity of operational and legal records.

Customer is responsible for ensuring that its authorized users understand and comply with this AUP. Capitalized terms not defined here have the meanings given in the Agreement or applicable Data Processing Addendum ("DPA").$md$
    ),
    (
      2,
      'authorized-use-and-authority',
      'Authorized Use and Authority',
      'Permitted purposes and limits of Customer authority.',
      $md$Customer may use Insight only for lawful business purposes within the services it has subscribed to and only to the extent Customer is authorized to act.

Customer and its users must maintain all rights, permissions, licenses, notices, consents, carrier authority, employment authority, and contractual approvals required for the data, workflows, reports, communications, inspections, automations, and decisions they initiate through Insight.

Access to a feature or data field does not itself establish authority to use it. Customer must not use Insight to exceed the authority granted by a carrier, employer, data subject, customer, regulator, contract, law, or TeamOptix role assignment.$md$
    ),
    (
      3,
      'accounts-and-access',
      'Accounts, Credentials, and Access',
      'Identity, authentication, and least-privilege responsibilities.',
      $md$Each user must access Insight through an individually assigned identity unless TeamOptix expressly approves a service account or other non-human identity for a defined integration.

Users must not share credentials, authentication factors, session tokens, recovery codes, API keys, or access links; impersonate another person; conceal the identity responsible for an action; or permit another person to use their account. Customer must assign the least privilege reasonably necessary, review privileged access, promptly remove access when duties or relationships change, and notify TeamOptix of suspected compromise.

Users must follow required authentication controls, including multifactor authentication where enabled, and must not bypass, weaken, or interfere with access controls, verification prompts, device protections, audit attribution, or session safeguards.$md$
    ),
    (
      4,
      'customer-and-carrier-data',
      'Customer and Carrier Data',
      'Authorized sourcing, minimization, and handling restrictions.',
      $md$Customer may submit Customer Data only when it is lawfully obtained, reasonably necessary for the selected services, and within Customer's authority. Customer must follow the data-minimization, retention, transformation, export, and deletion requirements in the DPA.

Customer and its users must not independently scrape, purchase, broker, aggregate, enrich, or upload unauthorized information concerning a carrier's routes, stops, packages, recipients, addresses, drivers, manifests, service performance, or other operations. Insight must not be used to build a carrier-intelligence repository beyond Customer's authorized operational scope.

Customer Data must not be sold, shared, rented, licensed, marketed, externally benchmarked, or repurposed for advertising, data brokerage, unrelated surveillance, competitive intelligence, or another party's independent benefit. Users must not export or retain delivery-level data merely because the interface makes export technically possible.$md$
    ),
    (
      5,
      'privacy-and-human-dignity',
      'Privacy and Human Dignity',
      'Restrictions against surveillance, discrimination, and personal harm.',
      $md$Insight may not be used to stalk, harass, threaten, intimidate, exploit, shame, or unlawfully monitor any person; infer sensitive traits unrelated to authorized operations; or create a personal dossier concerning a recipient, employee, applicant, contractor, driver, or other individual.

Customer must not use Insight for unlawful discrimination or to make decisions concerning employment, eligibility, credit, housing, insurance, healthcare, or other legally significant interests except where the applicable feature is expressly designed and approved for that purpose and Customer provides all legally required human review, notice, and process.

Operational analytics must be interpreted in context. Users must not present estimates, inferred facts, incomplete signals, or automated classifications as verified misconduct or definitive facts about a person.$md$
    ),
    (
      6,
      'general-prohibited-conduct',
      'General Prohibited Conduct',
      'Unlawful, deceptive, harmful, or abusive activity.',
      $md$Customer and its users must not use the services to:

- violate law, regulation, court order, carrier requirement, or binding contract;
- commit or facilitate fraud, theft, bribery, evasion, falsification, or deceptive conduct;
- upload malware, destructive code, unlawful content, or content that infringes another person's rights;
- interfere with service availability, integrity, performance, or another customer's use;
- conceal, falsify, or misrepresent identity, authority, source, time, location, approval, completion, or operational facts;
- use the services in a manner reasonably likely to cause physical harm, unlawful deprivation, material financial harm, or compromise of protected information; or
- assist another person in conduct prohibited by this AUP.

Customer must not use Insight for a high-risk purpose not included in the Agreement without TeamOptix's prior written approval and appropriate safeguards.$md$
    ),
    (
      7,
      'security-and-platform-integrity',
      'Security and Platform Integrity',
      'Protection of systems, tenants, identities, and audit evidence.',
      $md$Users must not probe, scan, test, reverse engineer, decompile, defeat, or exploit the services or their security controls except under a written testing authorization issued by TeamOptix. Good-faith security research must follow any published vulnerability-disclosure process and must avoid accessing, altering, retaining, or disclosing Customer Data.

Users must not bypass tenant separation, role controls, rate limits, feature gates, approval workflows, audit logs, retention controls, legal holds, signature controls, or technical restrictions; attempt unauthorized access; introduce malicious or disruptive code; conduct denial-of-service activity; or use automation to create unreasonable load.

Customer must use supported software and reasonable endpoint protections, safeguard secrets, apply security updates under its control, and promptly report suspected vulnerabilities, unauthorized access, credential compromise, or data exposure.$md$
    ),
    (
      8,
      'automation-ai-and-integrations',
      'Automation, AI, and Integrations',
      'Human authority and controlled machine action.',
      $md$Customer may enable automation, AI-assisted features, and integrations only within its documented authority and approved configuration. Customer remains responsible for the instructions, source access, recipients, schedules, approvals, and operational consequences of customer-configured actions.

Users must not use automation to evade access controls, overwhelm a system, indiscriminately collect data, fabricate activity, mass-message recipients without authority, or take actions a user could not lawfully perform directly. Users must review consequential outputs and must not rely on an automated or AI-generated result as the sole basis for a safety-critical, employment, legal, disciplinary, or other materially adverse decision.

Customer Data and Insight outputs must not be used to train, fine-tune, evaluate, or improve a general-purpose, shared, or third-party model unless TeamOptix and Customer expressly authorize the specific processing in writing and the DPA permits it. Users must not submit Customer Data to unapproved external AI tools.$md$
    ),
    (
      9,
      'operational-records-and-evidence',
      'Operational Records and Evidence',
      'Integrity of inspections, time, maintenance, compliance, and signatures.',
      $md$Users must create operational records honestly, contemporaneously where required, and through the identity responsible for the action. Users must not fabricate, backdate, suppress, duplicate, alter, or misclassify inspections, photographs, time records, route facts, manifests, maintenance records, repair scopes, compliance reports, approvals, signatures, acknowledgments, or other evidence.

Inspection and maintenance evidence must reflect the vehicle, condition, work, person, time, and context actually observed or performed. A user must not mark an item complete without the required inspection or work, reuse evidence from another event, obscure a material defect, or represent a tracking gap as verified delivery or verified failure without supporting evidence.

Customer must preserve records when required by law, contract, carrier policy, incident response, litigation hold, or an authorized investigation and must not use Insight to defeat an applicable preservation obligation.$md$
    ),
    (
      10,
      'communications-and-content',
      'Communications and Content',
      'Lawful, accurate, and authorized platform communications.',
      $md$Customer is responsible for content submitted or sent through Insight. Communications must be accurate in all material respects, directed only to authorized recipients, and consistent with applicable consent, employment, privacy, marketing, and carrier requirements.

Users must not send spam, phishing messages, threats, discriminatory content, malicious links, deceptive instructions, or unlawful solicitations; impersonate TeamOptix, a carrier, Customer leadership, or another person; or use platform messaging to collect credentials or unnecessary sensitive information.

Customer must not upload content it lacks the right to use or disclose. TeamOptix may remove or restrict access to content where reasonably necessary to address a legal violation, security threat, infringement claim, or material breach of this AUP.$md$
    ),
    (
      11,
      'intellectual-property-and-service-controls',
      'Intellectual Property and Service Controls',
      'Protection of licensed services without expanding data rights.',
      $md$Customer may use Insight, documentation, reports, and exports only as permitted by the Agreement. Except where law prohibits restriction, users must not copy, resell, sublicense, white-label, publish, or commercially exploit the services; derive source code; remove proprietary notices; or use nonpublic service information to build or assist a competing product.

This section does not transfer ownership of Customer Data to TeamOptix and does not limit Customer's authorized use of its own data or contract deliverables. Feedback voluntarily provided to TeamOptix may be used to improve the services only as permitted by the Agreement and without disclosing Customer Data or Customer confidential information.$md$
    ),
    (
      12,
      'customer-administration',
      'Customer Administration',
      'Governance duties for users, configurations, and source systems.',
      $md$Customer must designate authorized administrators, maintain accurate account and company information, configure roles appropriately, review access and automation assignments, and ensure that source-system connections and uploaded files are within Customer's authority.

Customer is responsible for user training, operational supervision, lawful workplace practices, review of platform outputs, correction of source data, and decisions made using Insight. Customer must not represent that TeamOptix independently verifies every source fact, guarantees carrier performance, replaces required professional judgment, or assumes Customer's legal or operational duties.

Customer must promptly address misuse by its users and cooperate in disabling compromised or unauthorized access.$md$
    ),
    (
      13,
      'reporting-and-cooperation',
      'Reporting and Cooperation',
      'How suspected misuse and security concerns are handled.',
      $md$Customer must promptly notify TeamOptix through an authorized support or security channel of suspected account compromise, unauthorized data access, material misuse, security vulnerabilities, falsified evidence, or activity reasonably likely to harm a person, customer, carrier relationship, or the services.

Customer will provide information reasonably necessary to investigate and contain the issue, preserve relevant evidence, and prevent recurrence. TeamOptix will limit requests and access to what is reasonably necessary and will handle Customer Data according to the Agreement and DPA.

No user may retaliate against a person for making a good-faith report of a security, safety, compliance, privacy, or integrity concern.$md$
    ),
    (
      14,
      'enforcement-and-suspension',
      'Enforcement and Suspension',
      'Proportionate response, notice, remediation, and emergency protection.',
      $md$TeamOptix may investigate suspected violations and may require Customer to stop the activity, remove content, secure an account, correct a configuration, preserve evidence, or implement a reasonable remediation plan.

TeamOptix may restrict or suspend affected access when reasonably necessary to prevent or contain a material security threat, unlawful activity, unauthorized disclosure, harm to a person, compromise of another customer, falsification of governed evidence, or substantial interference with the services. Where circumstances permit, TeamOptix will provide notice and a reasonable opportunity to cure before suspension. Emergency action may occur without advance notice when delay would materially increase risk.

Enforcement will be scoped and proportionate to the issue when reasonably practicable. TeamOptix will restore access after the material risk is resolved, unless termination is permitted by the Agreement. TeamOptix may preserve and disclose evidence only as permitted by the Agreement, DPA, or law.$md$
    ),
    (
      15,
      'policy-changes-and-conflicts',
      'Policy Changes and Conflicts',
      'Version control and relationship to negotiated terms.',
      $md$TeamOptix may update this AUP to address changes in law, security risk, technology, or the services. A material change will apply prospectively after reasonable notice unless earlier application is required to address an urgent security or legal risk.

The version incorporated into a locked Customer agreement remains the governing version for that agreement unless the parties adopt a later version or the Agreement expressly provides otherwise.

If this AUP conflicts with a negotiated term of the Agreement or DPA, the negotiated term controls to the extent of the conflict. Applicable law controls over all documents.$md$
    ),
    (
      16,
      'acknowledgment',
      'Acknowledgment',
      'Binding customer acceptance and continuing responsibility.',
      $md$By executing the Agreement or using the services after this AUP becomes effective, Customer acknowledges that it has reviewed this AUP and will ensure compliance by its authorized users, administrators, employees, contractors, agents, integrations, and devices.

**Customer:** [Customer Legal Name]  
**Provider:** Team Optix, LLC  
**Effective Date:** [Date]  
**Customer Representative:** [Customer Lead]  
**Team Optix Representative:** [Team Optix Lead]$md$
    )
)
insert into legal.document_section (
  document_id, section_number, section_key, title, summary, body_markdown,
  status, workflow_status
)
select
  document.id,
  aup_sections.section_number,
  aup_sections.section_key,
  aup_sections.title,
  aup_sections.summary,
  aup_sections.body_markdown,
  'DRAFT',
  'DRAFT'
from legal.document document
cross join aup_sections
where document.document_key = 'ACCEPTABLE_USE_POLICY'
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
where document_key = 'ACCEPTABLE_USE_POLICY';

commit;
