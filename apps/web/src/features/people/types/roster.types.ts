export type RosterRow = {
  roster_member_id: string
  person_id: string | null

  full_name: string

  worker_type: string | null
  job_title: string | null

  employment_status: "Active" | "Candidate" | "Former"

  market_code: string | null
  reports_to_name: string | null

  hire_date: string | null

  invite_status:
    | "Not Invited"
    | "Invited"
    | "Linked"

  compliance_summary:
    | "Compliant"
    | "Missing"
    | "Expiring"
    | "Expired"

  fx_id: string | null
  dswid: string | null
}