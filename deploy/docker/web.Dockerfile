# Statischer Export der Expo-App, ausgeliefert von Caddy. Caddy ist zugleich der Reverse Proxy.
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
RUN pnpm install --frozen-lockfile --filter "@fokus/web..."
COPY . .
RUN EXPO_PUBLIC_API_URL= pnpm --filter @fokus/web build

FROM caddy:2.11.6-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv
EXPOSE 80
