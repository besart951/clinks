FROM node:26.13.0-bookworm-slim AS workspace
WORKDIR /app
RUN npm install -g pnpm@12.21.0
COPY . .
RUN pnpm install --frozen-lockfile
USER node
CMD ["node","apps/api/src/main.ts"]

FROM workspace AS web
USER root
ARG WEB_ORIGIN
ARG API_ORIGIN
ARG SYNC_ORIGIN
ARG COLLAB_ORIGIN
RUN test -n "$API_ORIGIN" && test -n "$SYNC_ORIGIN" && test -n "$COLLAB_ORIGIN" && VITE_API_URL="$API_ORIGIN" VITE_POWERSYNC_URL="$SYNC_ORIGIN" VITE_COLLAB_URL="$COLLAB_ORIGIN" pnpm --filter @clinks/web build

FROM caddy:2-alpine AS edge
COPY --from=web /app/apps/web/build /srv
COPY infra/production/Caddyfile /etc/caddy/Caddyfile
