export type CompanyAssetRow = {
  asset_id: string;
  company_slug: string;
  asset_type_key: string;
  asset_type_label: string;
  status_key: string;
  status_label: string;
  status_group: string;
  is_assignable: boolean;
  asset_identifier: string;
  display_name: string | null;
  provider: string | null;
  secondary_identifier: string | null;
  notes: string | null;
  assignment_muted: boolean;

  assigned_person_id: string | null;
  assigned_person_name: string | null;

  assigned_roster_member_id: string | null;
  assigned_roster_member_name: string | null;

  assigned_at: string | null;
  released_at: string | null;
  updated_at: string | null;
};
