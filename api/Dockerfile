# Build context is the repo root (see api/cloudbuild.yaml), because this service
# depends on the shared workspace package.
FROM node:26-slim AS build
# Node 25+ no longer ships corepack, so install the pinned pnpm (matches packageManager in package.json).
RUN npm install -g pnpm@10.28.0
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY shared/package.json shared/
COPY api/package.json api/
RUN pnpm install --frozen-lockfile --filter api... --filter @adidi/shared
COPY shared/ shared/
COPY api/ api/
RUN pnpm --filter @adidi/shared build && pnpm --filter api build
# Self-contained copy of the service with production deps only (workspace deps included).
RUN pnpm --filter api deploy --prod --legacy /out

FROM node:26-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out /app
USER node
EXPOSE 8080
CMD ["node", "dist/index.js"]
