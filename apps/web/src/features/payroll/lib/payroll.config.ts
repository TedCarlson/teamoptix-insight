export type CompanyPayrollConfig = {
  include_non_driver_workers: boolean;
};

export const DEFAULT_COMPANY_PAYROLL_CONFIG: CompanyPayrollConfig = {
  include_non_driver_workers: false,
};

export async function getCompanyPayrollConfig(
  _companySlug: string
): Promise<CompanyPayrollConfig> {
  // This is the company payroll configuration seam.
  // Persistence and client controls can replace this default later without
  // changing payroll summary, totals, or report governance.
  return DEFAULT_COMPANY_PAYROLL_CONFIG;
}
