const EMAIL_ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function splitPayrollRecipientInput(value: string) {
  return value
    .split(/[,\n;]/)
    .map((email) => email.trim())
    .filter(Boolean);
}

export function isPayrollRecipientEmail(value: string) {
  return EMAIL_ADDRESS_PATTERN.test(value.trim());
}

export function composePayrollReportRecipients(
  authorizedOperatorEmail: string,
  optionalRecipients: string[]
) {
  const recipients = [authorizedOperatorEmail, ...optionalRecipients]
    .map((email) => email.trim().toLowerCase())
    .filter(isPayrollRecipientEmail);

  return Array.from(new Set(recipients));
}
