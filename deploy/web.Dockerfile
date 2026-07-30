FROM node:24-alpine AS build
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --frozen-lockfile
ARG PUBLIC_API_BASE_URL
ENV PUBLIC_API_BASE_URL=$PUBLIC_API_BASE_URL
RUN pnpm --filter @clinks/admin build && pnpm --filter @clinks/planer-link build && pnpm --filter @clinks/infra-link build

FROM nginx:1.29-alpine
COPY deploy/nginx/templates /etc/nginx/templates
COPY --from=build /workspace/apps/admin/build /usr/share/nginx/admin
COPY --from=build /workspace/apps/planer_link/build /usr/share/nginx/planer
COPY --from=build /workspace/apps/infra_link/build /usr/share/nginx/infra
EXPOSE 80 443
