# Insight Compliance Engine

## Federal Overtime Reference (v1)

**Reference version:** 1.0  
**Last verified:** July 24, 2026  
**Scope:** Federal FLSA overtime, the Motor Carrier Act exemption, and the small-vehicle exception

> This document is an operational reference, not legal advice or a legal opinion. Statutes,
> regulations, agency guidance, and controlling court decisions govern. A qualified attorney
> should review company-specific configurations and disputed cases.

## Purpose

The Compliance Engine evaluates verified operational facts against configured federal rules.
It explains why Insight requests particular evidence and records which rule and sources support
a determination. Payroll consumes a finalized Compliance result; Payroll does not independently
decide whether the Motor Carrier Act exemption applies.

## Federal overtime baseline

Section 7(a)(1) of the Fair Labor Standards Act generally requires a covered, nonexempt employee
who works more than 40 hours in a workweek to receive at least one and one-half times the
employee's regular rate for the excess hours.

Primary authority: [29 U.S.C. § 207(a)(1)](https://uscode.house.gov/view.xhtml?req=%28title%3A29+section%3A207+edition%3Aprelim%29)

## Motor Carrier Act exemption

FLSA section 13(b)(1) exempts from section 7 an employee for whom the Secretary of
Transportation has authority to establish qualifications and maximum hours of service under
the Motor Carrier Act.

The Department of Labor identifies three central requirements:

1. The employee is employed by a motor carrier or motor private carrier.
2. The employee is a driver, driver's helper, loader, or mechanic whose duties affect the safe
   operation of motor vehicles in transportation on public highways in interstate or foreign
   commerce.
3. The employee is not covered by the small-vehicle exception.

Vehicle weight alone does not establish the exemption. Employer status, interstate-commerce
facts, duties, and the small-vehicle exception must also be evaluated.

Primary and interpretive authorities:

- [29 U.S.C. § 213(b)(1)](https://uscode.house.gov/view.xhtml?req=%28title%3A29+section%3A213%28b%29+edition%3Aprelim%29)
- [29 C.F.R. Part 782](https://www.ecfr.gov/current/title-29/subtitle-B/chapter-V/subchapter-B/part-782)
- [DOL Wage and Hour Division Fact Sheet #19](https://www.dol.gov/agencies/whd/fact-sheets/19-flsa-motor-carrier)

## Small-vehicle exception

Section 306 of the SAFETEA-LU Technical Corrections Act of 2008 makes FLSA section 7 applicable
to a covered employee notwithstanding the Motor Carrier Act exemption. Under Department of
Labor guidance, the exception applies in a workweek in which the employee performs, in whole
or in part, qualifying safety-affecting duties on a vehicle weighing 10,000 pounds or less.
The exception can apply even when the employee also performs qualifying work on vehicles over
10,000 pounds in the same workweek.

This is why Insight evaluates vehicle exposure by workweek rather than assigning a permanent
overtime result from a worker's usual vehicle class.

Important statutory exclusions require separate treatment. A vehicle is not treated as a
small vehicle for this purpose if it is:

- designed or used to transport more than eight passengers, including the driver, for
  compensation;
- designed or used to transport more than fifteen passengers, including the driver, without
  compensation; or
- used to transport hazardous material requiring placarding.

Primary and interpretive authorities:

- [Public Law 110-244, § 306](https://www.govinfo.gov/content/pkg/PLAW-110publ244/pdf/PLAW-110publ244.pdf)
- [DOL Field Assistance Bulletin 2010-2](https://www.dol.gov/agencies/whd/field-assistance-bulletins/2010-2)
- [DOL Fact Sheet #19 — Small Vehicle Exception](https://www.dol.gov/agencies/whd/fact-sheets/19-flsa-motor-carrier)

## Weight evidence used by Insight

For enforcement purposes, DOL Field Assistance Bulletin 2010-2 uses:

- the vehicle's gross vehicle weight rating (GVWR); or
- the gross combined vehicle weight rating (GCWR) when the vehicle is pulling a trailer.

The bulletin notes that GVWR is usually found on the vehicle's door-jamb plate. Insight
therefore treats verified manufacturer rating evidence as the authoritative input rather than
estimated cargo weight or an operational class label.

Accepted evidence may include:

- manufacturer certification label;
- manufacturer specification;
- registration or title;
- lease record;
- supported VIN-derived specification; or
- another reviewed manufacturer record.

A manual entry is provisional evidence. It does not become verified merely because a number
was entered.

## Fleet classification model

Fleet maintains two separate classifications.

### Operational class

`L10`, `L15`, and `L20` support fleet planning and reporting. They are operational labels and
do not determine federal overtime treatment.

### Federal weight band

The current no-trailer v1 classification derives from verified GVWR:

| Band | Meaning |
| --- | --- |
| `SMALL_VEHICLE_10K_OR_LESS` | Verified GVWR of 10,000 pounds or less |
| `OVER_10K` | Verified GVWR greater than 10,000 pounds |
| `UNVERIFIED` | Missing, disputed, expired, pending, or otherwise unverified evidence |

DOT weight class is also derived from GVWR for Fleet reporting. Neither DOT class nor the
operational L-class independently establishes an overtime exemption.

When trailer exposure is relevant, GCWR must be collected and evaluated before the engine can
make a supported small-vehicle determination. The current v1 GVWR-only band must not be used
to decide a trailer workweek.

## Evidence and effective dating

Vehicle classifications are maintained as effective-dated records. A correction creates a new
record rather than rewriting the evidence previously used for a payroll period. This allows an
audit to reconstruct:

- the rating and verification status effective on the service date;
- the evidence source and reference;
- who verified the classification and when; and
- which fact version supported the determination.

## Weekly example

| Day | Verified GVWR | Federal band |
| --- | ---: | --- |
| Monday | 14,500 lb | `OVER_10K` |
| Tuesday | 14,500 lb | `OVER_10K` |
| Wednesday | 9,900 lb | `SMALL_VEHICLE_10K_OR_LESS` |
| Thursday | 14,500 lb | `OVER_10K` |
| Friday | 14,500 lb | `OVER_10K` |

Wednesday's qualifying small-vehicle work is a material weekly fact. It does not by itself
prove every prerequisite for overtime coverage; the engine must also evaluate the worker's
duties, transportation, vehicle exclusions, and other applicable facts.

## Fail-closed policy

Insight does not assert an exemption when a material fact is unresolved. Examples include:

- missing or unverified vehicle rating;
- trailer use without GCWR;
- unknown passenger or placarded-hazardous-material status;
- missing or conflicting vehicle assignments;
- missing employer carrier or interstate-commerce facts; and
- missing worker duty qualification.

An unresolved case is routed for review with a reason code. Fail-closed means the engine will
not finalize an exemption without sufficient evidence; it does not mean every unresolved case
is automatically adjudicated as overtime due.

## System responsibility boundaries

**Fleet** owns vehicle identity, operational class, verified weight evidence, derived weight
classification, and classification history.

**Compliance** owns governing rule versions, weekly exposure facts, exemption evaluation,
exceptions, review cases, final determinations, and audit snapshots.

**Payroll** owns compensation components, regular-rate calculations, overtime premium, and
payroll output. Payroll consumes the finalized Compliance determination.

## v1 limitations

The first release is limited to configured federal FLSA/Motor Carrier Act analysis. It does not
resolve state overtime, daily overtime, prevailing wage, collective-bargaining terms, meal or
rest rules, or other jurisdiction-specific requirements.

Passenger-capacity, placarded-hazardous-material, and trailer/GCWR scenarios must remain
review-required until their facts and rule branches are implemented and validated.

## Source hierarchy and maintenance

When sources conflict, use this order:

1. United States Code and enacted public law;
2. applicable regulations in the Code of Federal Regulations;
3. controlling court decisions;
4. current Department of Labor guidance; and
5. this operational reference.

DOL fact sheets and field assistance bulletins explain agency positions but do not replace the
statute or regulations. Compliance rule releases should record the source versions reviewed.
Reverify this document before changing a rule, after a relevant legal development, and at least
annually.

### Citation index

- [29 U.S.C. § 207 — Maximum hours and overtime](https://uscode.house.gov/view.xhtml?req=%28title%3A29+section%3A207+edition%3Aprelim%29)
- [29 U.S.C. § 213(b)(1) — Motor Carrier Act exemption](https://uscode.house.gov/view.xhtml?req=%28title%3A29+section%3A213%28b%29+edition%3Aprelim%29)
- [29 C.F.R. Part 782 — Exemption from Maximum Hours Provisions for Certain Employees of Motor Carriers](https://www.ecfr.gov/current/title-29/subtitle-B/chapter-V/subchapter-B/part-782)
- [Public Law 110-244, § 306 — SAFETEA-LU Technical Corrections Act of 2008](https://www.govinfo.gov/content/pkg/PLAW-110publ244/pdf/PLAW-110publ244.pdf)
- [DOL Fact Sheet #19 — Motor Carrier Exemption](https://www.dol.gov/agencies/whd/fact-sheets/19-flsa-motor-carrier)
- [DOL Field Assistance Bulletin 2010-2 — Change in Application of the Motor Carrier Exemption](https://www.dol.gov/agencies/whd/field-assistance-bulletins/2010-2)
- [DOL Field Operations Handbook, Chapter 24 — Transportation Exemptions](https://www.dol.gov/agencies/whd/field-operations-handbook/Chapter-24)
