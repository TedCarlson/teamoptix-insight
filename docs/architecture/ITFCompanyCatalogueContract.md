# ITF company catalogue contract

## Decision

Each donor contractor with current 410 or 427 roster evidence becomes one commercial company. Integrated Tech Group remains the prime company. Every contractor company receives an ITF product entry in review and a proposed subcontractor relationship with ITG.

This event does not create contractor locations, engagements, roster records, or workforce assignments. Those depend on the location and assignment reconciliation described below.

## Company naming

- `company_name` is the roster/reporting name shown to users (`Show as`).
- `legal_name` is a separately verified registered name and remains empty until confirmed.
- Donor contractor ID and code remain immutable external references.
- Donor catalogue, roster-export, and FUSE names remain source aliases.
- A FUSE suffix such as `INC` or `LLC` is not promoted to legal name without verification.

Examples:

| Show as | Donor code | Recognized source aliases |
| --- | --- | --- |
| J&L Unlimited | JLU | J&L Unlimited; J&L Unlimited Contracting LLC |
| JComm | JCM | JComm; Jcomm |
| Mold Cable | MLD | Mold Cable; Mold Cable INC |
| Video Installation Pros | VIP | Video Installation Pros; VIP VIDEO INSTALLATION PROS |
| WIFIRENET | WFN | WIFIRENET; WIFIRENET INC |

## Catalogue selected from current roster evidence

### 410 roster

BR Underground, Cable Warriors, Conex, General Cable, J&L Unlimited, JComm, Mold Cable, Regiistek, Sigma, Smart Cable Tech LLC, St. Victor Services, Star Communications, and Terokar LLC.

### 427 roster

Grand Trade, HighTek Contracting, JComm, Leon Cable, North Cable USA, Video Installation Pros, WIFIRENET, and WYRI.

JComm is one company with evidence in both locations. It must not be duplicated by location.

## Reconciliation holds before location or roster migration

The live donor assignment records and the two approved roster exports are not fully aligned:

| Donor signal | Approved roster export | Required treatment |
| --- | --- | --- |
| HighTek has one active 410 technician | HighTek appears only in 427 export | Hold the 410 assignment for confirmation |
| WIFIRENET has one active 410 assignment for a technician also active in 427 | WIFIRENET appears only in 427 export | Treat as an unclosed transfer candidate; do not duplicate the worker |
| CJG Business Group has two active 427 rows | CJG is absent from the approved 427 export | Keep company/location outside the initial catalogue until confirmed |
| North Cable has a donor contractor link to 410 and 427 | Current roster and active workforce evidence are 427 only | Activate 427 only |
| Conex, General Cable, St. Victor Services, and Terokar have roster/workforce rows but no donor contractor-assignment row | All appear in the approved 410 roster | Company catalogue is valid; location relationship start must use workforce evidence |
| Prime Net USA LLC appears only as a Not Qualified FUSE candidate | No current roster rows | Preserve onboarding history; do not create the company relationship yet |

Corepath and Signal X are not in the selected catalogue. Their requested but ungranted location relationships must not be inferred or created.

## Next approved event

For each catalogue company:

1. Confirm the `Show as` name and optionally enter a verified legal name.
2. Approve the company’s 410/427 ITF location participation from the roster evidence.
3. Activate the ITG subcontractor relationship and create a location-scoped engagement.
4. Reconcile each donor person to one company-owned roster record.
5. Rebuild effective-dated workforce assignments, closing stale location rows before opening the authoritative row.
6. Compare company/location/seat/team counts with the donor before enabling the company workspace.
