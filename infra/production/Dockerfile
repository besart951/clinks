FROM node:26.13.1-bookworm-slim AS base
WORKDIR /app
RUN npm install -g pnpm@12.21.0

FROM base AS web
COPY . .
RUN pnpm install --frozen-lockfile
ARG WEB_ORIGIN
ARG API_ORIGIN
ARG SYNC_ORIGIN
ARG COLLAB_ORIGIN
RUN test -n "$API_ORIGIN" && test -n "$SYNC_ORIGIN" && test -n "$COLLAB_ORIGIN" && VITE_API_URL="$API_ORIGIN" VITE_POWERSYNC_URL="$SYNC_ORIGIN" VITE_COLLAB_URL="$COLLAB_ORIGIN" pnpm --filter @clinks/web build

FROM base AS workspace
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/collab/package.json apps/collab/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/i18n-types/package.json packages/i18n-types/package.json
COPY packages/sync-schema/package.json packages/sync-schema/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm install --filter @clinks/api... --filter @clinks/collab... --frozen-lockfile --prod --ignore-scripts
COPY localization localization
COPY apps/api/src apps/api/src
COPY apps/collab/src apps/collab/src
COPY packages/contracts/src packages/contracts/src
COPY packages/db/src packages/db/src
COPY packages/db/migrations packages/db/migrations
COPY packages/domain/src packages/domain/src
COPY packages/i18n-types/src packages/i18n-types/src
COPY packages/sync-schema/src packages/sync-schema/src
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD ["node","-e","fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node","apps/api/src/main.ts"]

FROM caddy:2.10.2-alpine AS edge
COPY --from=web /app/apps/web/build /srv
COPY infra/production/Caddyfile /etc/caddy/Caddyfile
