# Manifest test fixture policy

- Use synthetic company, route, recipient, address, phone, and tracking values.
- Never commit FedEx credentials, session data, customer names, or unredacted production workbooks.
- Preserve only the workbook/table structure and duplicate-identity shapes required for regression.
- Prefer table-row fixtures for parser and deduplication tests. A binary workbook fixture requires an explicit privacy review.
- Document which production failure shape a synthetic fixture represents without copying production record identifiers.
