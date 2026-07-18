# Engineering telemetry

Engineering telemetry observes the infrastructure supporting Insight. It does not replace automation telemetry or interpret customer business outcomes.

## Provider configuration

All credentials are server-only environment variables. Use read-only or least-privilege credentials wherever the provider supports them.

| Provider | Required variables | First check |
| --- | --- | --- |
| Vercel | `VERCEL_ACCESS_TOKEN`, `VERCEL_PROJECT_ID`; optional `VERCEL_TEAM_ID` | Latest production deployment is ready |
| Supabase | Existing `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | REST API reachability and latency |
| DigitalOcean | `DIGITALOCEAN_ACCESS_TOKEN`, `DIGITALOCEAN_DROPLET_ID` | Runner Droplet is active |
| Backblaze | Existing `B2_S3_ENDPOINT`, `B2_S3_REGION`, `B2_KEY_ID`, `B2_APPLICATION_KEY`, `B2_FLEET_EVIDENCE_BUCKET` | Archive bucket is accessible |

The collector is scheduled every five minutes at `/api/cron/engineering/platform-telemetry`. When `CRON_SECRET` is configured, direct calls must provide it as a bearer token.

## Grading

- `HEALTHY`: the latest check completed successfully within its expected performance boundary.
- `DEGRADED`: the provider is reachable, but its state or latency requires attention.
- `FAILED`: the latest check could not confirm the required capability.
- `UNKNOWN`: credentials are missing, no evidence exists, or the latest evidence is more than 15 minutes old.

Overall platform state follows the weakest critical dependency. Unknown is never treated as healthy.

## Authority boundaries

- Engineering owns provider availability, performance, capacity, delivery, and protection evidence.
- Automation owns ticket, runner, artifact, ingestion, and warehouse outcomes.
- Product governance combines those facts to determine capability and customer impact.
