FROM mcr.microsoft.com/playwright:v1.61.0-jammy

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/automation-worker/package.json apps/automation-worker/package.json

RUN corepack enable && pnpm install --filter @teamoptix/automation-worker... --prod=false

COPY apps/automation-worker apps/automation-worker

RUN pnpm -C apps/automation-worker build

EXPOSE 8787

CMD ["node", "apps/automation-worker/dist/server.js"]
