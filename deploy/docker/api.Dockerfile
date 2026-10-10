# Baut die API als ein Bundle. Laufzeit-Image ohne node_modules und ohne pnpm.
FROM node:24-bookworm-slim AS build
WORKDIR /repo
RUN npm install -g pnpm@12.8.1
# Erst nur die Paketlisten: die Installation bleibt im Cache, solange pnpm-lock.yaml gleich ist.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/updater/package.json apps/updater/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/ui/package.json packages/ui/
RUN pnpm install --frozen-lockfile --filter "@fokus/api..."
COPY . .
RUN pnpm --filter @fokus/api build

FROM node:24-bookworm-slim
ARG FK_VERSION=dev
# Nur für Test-Releases (-broken): /health meldet absichtlich einen Fehler
ARG FK_SELFTEST_BROKEN=
ENV NODE_ENV=production \
    PORT=3000 \
    MIGRATIONS_DIR=/app/drizzle \
    FK_VERSION=${FK_VERSION} \
    FK_SELFTEST_BROKEN=${FK_SELFTEST_BROKEN}
WORKDIR /app
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/packages/db/drizzle ./drizzle
RUN echo '{"type":"module"}' > package.json
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
