FROM node:24-alpine
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --frozen-lockfile
CMD ["pnpm", "--filter", "@clinks/admin", "dev", "--host", "0.0.0.0"]
