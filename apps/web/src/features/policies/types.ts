export type CompanyPolicySection = { id: string; position: number; title: string; body: string };
export type CompanyPolicySummary = { id: string; title: string; description: string | null; status: string; current_version: number; updated_at: string };
export type CompanyPolicyVersion = { id: string; version_number: number; title: string; section_count: number; published_at: string; published_by: string; assigned_count: number; acknowledged_count: number; declined_count: number };
export type CompanyPolicyAssignment = { id: string; version_id: string; version_number: number; roster_id: string; employee_name: string; status: string; rolled_out_at: string; reviewed_at: string | null; responded_at: string | null; response_comment: string | null };
export type CompanyPolicyWorkspace = {
  company: { id: string; name: string; slug: string };
  policies: CompanyPolicySummary[];
  selected_policy: (CompanyPolicySummary & { created_at: string }) | null;
  sections: CompanyPolicySection[];
  versions: CompanyPolicyVersion[];
  assignments: CompanyPolicyAssignment[];
};

export type EmployeePolicyTask = {
  id: string;
  status: "PENDING" | "ACKNOWLEDGED" | "DECLINED";
  rolled_out_at: string;
  reviewed_at: string | null;
  responded_at: string | null;
  response_comment: string | null;
  version: { id: string; number: number; title: string; description: string | null; snapshot: { policy: { title: string; description: string | null }; sections: Array<{ position: number; title: string; body: string }> }; published_at: string };
};

