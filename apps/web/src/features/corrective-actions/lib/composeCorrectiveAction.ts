export function renderCanStatement(
  statement: string,
  values: { employeeName: string; companyName: string; incidentDate: string }
) {
  return statement
    .replaceAll("{{employee_name}}", values.employeeName || "the employee")
    .replaceAll("{{company_name}}", values.companyName || "the company")
    .replaceAll("{{incident_date}}", values.incidentDate || "the documented date");
}

export function splitStopReferences(value: string) {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}
