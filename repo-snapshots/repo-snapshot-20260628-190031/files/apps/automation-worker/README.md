# Automation Worker

Runs browser automation outside Vercel.

## Required env

PORT=8787
AUTOMATION_WORKER_TOKEN=<shared secret>

## Local

AUTOMATION_WORKER_TOKEN=local-test pnpm -C apps/automation-worker dev

## Health

curl http://localhost:8787/health

## Docker

docker build -f apps/automation-worker/Dockerfile -t teamoptix-automation-worker .
docker run --rm -p 8787:8787 -e AUTOMATION_WORKER_TOKEN=local-test teamoptix-automation-worker
