# Updater: Node, Docker-CLI mit Compose, cosign, age und rclone (Backup außer Haus).
# Einziger Dienst mit Docker-Socket.
FROM node:24-alpine AS build
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
RUN pnpm install --frozen-lockfile --filter "@fokus/updater..."
COPY . .
RUN pnpm --filter @fokus/updater build

FROM node:24-alpine
ARG TARGETARCH=amd64
# cosign mit fester Version und geprüfter Prüfsumme (aus dem GitHub-Release von sigstore/cosign)
ARG COSIGN_VERSION=v2.6.5
ARG COSIGN_SHA256_AMD64=c3b4f5410e608af03a5eb0aaac84a4313d8da131248e08ff1759ac70c79d1644
ARG COSIGN_SHA256_ARM64=426193b4c5da4d4d643e822f48fe0cc8a476ca1782a272704831f5a0cef716d7
# age und rclone aus den signierten Alpine-Paketquellen
RUN apk add --no-cache docker-cli docker-cli-compose tar age rclone \
 && case "$TARGETARCH" in \
      amd64) SUM="$COSIGN_SHA256_AMD64" ;; \
      arm64) SUM="$COSIGN_SHA256_ARM64" ;; \
      *) echo "Architektur $TARGETARCH nicht unterstützt" && exit 1 ;; \
    esac \
 && wget -q -O /usr/local/bin/cosign "https://github.com/sigstore/cosign/releases/download/${COSIGN_VERSION}/cosign-linux-${TARGETARCH}" \
 && echo "${SUM}  /usr/local/bin/cosign" | sha256sum -c - \
 && chmod +x /usr/local/bin/cosign
ARG FK_VERSION=dev
ENV NODE_ENV=production FK_UPDATER_VERSION=${FK_VERSION}
WORKDIR /app
COPY deploy/cosign.pub /app/cosign.pub
COPY --from=build /repo/apps/updater/dist ./dist
RUN echo '{"type":"module"}' > package.json
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O - http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "dist/main.js"]
