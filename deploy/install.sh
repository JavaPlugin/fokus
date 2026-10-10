#!/usr/bin/env bash
# FOKUS: Installation auf einer frischen Debian-12- oder -13-VM.
#
#   Aufruf (als root):
#     bash install.sh
#   oder ohne Rückfragen, z. B. für Tests:
#     PUBLIC_URL=https://… CLOUDFLARE_TUNNEL_TOKEN=… GHCR_USER=… GHCR_TOKEN=… \
#     SMTP_HOST=… SMTP_USER=… SMTP_PASS=… SMTP_FROM=… bash install.sh
#
# Idempotent: Ein zweiter Lauf behält vorhandene Secrets und Daten.
set -euo pipefail
# Kein stiller Abbruch: Zeile und Befehl nennen.
trap 'printf "\033[31mx   Abbruch in Zeile %s: %s\033[0m\n" "$LINENO" "$BASH_COMMAND" >&2' ERR
# Nach "su" (ohne "-") fehlt /usr/sbin im PATH, dort liegen sshd und nft.
export PATH="/usr/local/sbin:/usr/sbin:/sbin:$PATH"

FK_REPO="${FK_REPO:-JavaPlugin/fokus}"
FK_DIR="${FK_DIR:-/opt/fokus}"
FK_VERSION_WANTED="${FK_VERSION:-}"

say()  { printf '\033[1m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[33m!   %s\033[0m\n' "$*" >&2; }
die()  { printf '\033[31mx   %s\033[0m\n' "$*" >&2; exit 1; }

# Liest von /dev/tty, damit auch "curl … | bash" interaktiv funktioniert.
ask() {
  local var="$1" prompt="$2" secret="${3:-}" value="${!1:-}"
  if [ -n "$value" ]; then return; fi
  [ -r /dev/tty ] || die "$var fehlt und es gibt kein Terminal für Rückfragen."
  if [ "$secret" = secret ]; then
    read -rsp "$prompt: " value </dev/tty; echo
  else
    read -rp "$prompt: " value </dev/tty
  fi
  [ -n "$value" ] || die "$var darf nicht leer sein."
  printf -v "$var" '%s' "$value"
}

rand() { openssl rand -hex "$1"; }

# Wie ask, aber leere Antwort erlaubt (optionale Werte).
ask_opt() {
  local var="$1" prompt="$2" secret="${3:-}" value="${!1:-}"
  if [ -n "$value" ] || [ ! -r /dev/tty ]; then return; fi
  if [ "$secret" = secret ]; then
    read -rsp "$prompt: " value </dev/tty; echo
  else
    read -rp "$prompt: " value </dev/tty
  fi
  printf -v "$var" "%s" "$value"
}

# ---------- 1. System prüfen ----------
say "System prüfen"
[ "$(id -u)" -eq 0 ] || die "Bitte als root ausführen (sudo -i)."
. /etc/os-release
[ "${ID:-}" = debian ] || die "Nur Debian wird unterstützt (gefunden: ${ID:-?})."
case "${VERSION_ID:-}" in 12|13) ;; *) warn "Getestet mit Debian 12 und 13, gefunden: ${VERSION_ID:-?}." ;; esac
case "$(dpkg --print-architecture)" in amd64|arm64) ;; *) die "Architektur nicht unterstützt." ;; esac
mem_mb=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
[ "$mem_mb" -ge 1800 ] || warn "Nur ${mem_mb} MB RAM. Empfohlen sind 4 GB."
disk_gb=$(df -BG --output=avail / | tail -1 | tr -dc 0-9)
[ "$disk_gb" -ge 10 ] || die "Nur ${disk_gb} GB frei. Mindestens 10 GB nötig."

# ---------- 2. Pakete, Docker, automatische Updates ----------
say "Pakete installieren"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg jq openssl nftables unattended-upgrades qemu-guest-agent >/dev/null

if ! command -v docker >/dev/null; then
  say "Docker installieren"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL --retry 4 --retry-all-errors --retry-delay 3 https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian ${VERSION_CODENAME} stable" \
    >/etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin >/dev/null
fi
systemctl enable --now docker qemu-guest-agent >/dev/null 2>&1 || true

cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

# ---------- 3. SSH und Firewall ----------
say "SSH und Firewall absichern"
if compgen -G "/root/.ssh/authorized_keys" >/dev/null || compgen -G "/home/*/.ssh/authorized_keys" >/dev/null; then
  cat >/etc/ssh/sshd_config.d/10-fokus.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
  systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true
else
  warn "Kein SSH-Schlüssel gefunden. Passwort-Login bleibt an, damit du dich nicht aussperrst."
fi

ssh_port=$( (sshd -T 2>/dev/null || true) | awk '/^port / {print $2; exit}')
ssh_port="${ssh_port:-22}"
# Eigene Tabelle statt "flush ruleset", damit Dockers Regeln unberührt bleiben.
cat >/etc/nftables.conf <<EOF
#!/usr/sbin/nft -f
# FOKUS: eingehend nur SSH. Die App ist über den Cloudflare Tunnel erreichbar (ausgehend).
table inet fokus_host
delete table inet fokus_host
table inet fokus_host {
  chain input {
    type filter hook input priority 0; policy drop;
    iif lo accept
    ct state established,related accept
    ct state invalid drop
    meta l4proto { icmp, ipv6-icmp } accept
    tcp dport ${ssh_port} accept
  }
}
EOF
systemctl enable nftables >/dev/null 2>&1 || warn "nftables-Dienst nicht aktiviert. Regeln gelten bis zum Neustart."
nft -f /etc/nftables.conf

# ---------- 4. Konfiguration ----------
say "Konfiguration"
mkdir -p "$FK_DIR"
chmod 700 "$FK_DIR"
ENV_FILE="$FK_DIR/.env"
if [ -f "$ENV_FILE" ]; then
  say "Vorhandene $ENV_FILE wird weiterverwendet"
  set -a; . "$ENV_FILE"; set +a
fi

ask PUBLIC_URL "Öffentliche Adresse (z. B. https://fokus.deinedomain.de)"
PUBLIC_URL="${PUBLIC_URL%/}"
[[ "$PUBLIC_URL" =~ ^https://[a-z0-9.-]+\.[a-z]{2,}$ ]] || die "Adresse muss wie https://fokus.example.de aussehen."
ask CLOUDFLARE_TUNNEL_TOKEN "Cloudflare-Tunnel-Token" secret
ask GHCR_USER "GitHub-Benutzername"
ask GHCR_TOKEN "GitHub-Lese-Token (read:packages, contents:read)" secret
ask SMTP_HOST "SMTP-Server"
SMTP_PORT="${SMTP_PORT:-587}"
ask SMTP_USER "SMTP-Benutzer"
ask SMTP_PASS "SMTP-Passwort" secret
ask SMTP_FROM "Absender (z. B. FOKUS <fokus@deinedomain.de>)"

POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(rand 24)}"
APP_DB_PASSWORD="${APP_DB_PASSWORD:-$(rand 24)}"
BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:-$(rand 32)}"
SETUP_CODE="${SETUP_CODE:-$(rand 3)-$(rand 3)-$(rand 3)}"
UPDATER_SECRET="${UPDATER_SECRET:-$(rand 32)}"

# Optional: Proxmox-Snapshot der ganzen VM vor jedem Update (siehe README).
# Wird nur einmal gefragt. Leer lassen = kein Snapshot, nachtragen geht jederzeit in der .env.
if [ -z "${PROXMOX_ASKED:-}" ] && [ -r /dev/tty ]; then
  read -rp "Proxmox-Snapshot vor jedem Update einrichten? (j/N): " yn </dev/tty
  if [[ "$yn" =~ ^[jJyY] ]]; then
    ask_opt PROXMOX_URL "Proxmox-Adresse (z. B. https://192.168.1.10:8006)"
    ask_opt PROXMOX_NODE "Node-Name (z. B. pve)"
    ask_opt PROXMOX_VMID "VM-ID dieser VM (z. B. 210)"
    ask_opt PROXMOX_TOKEN_ID "API-Token-ID (z. B. fokus@pve!updater)"
    ask_opt PROXMOX_TOKEN_SECRET "API-Token-Secret" secret
    ask_opt PROXMOX_TLS_FINGERPRINT "SHA-256-Fingerprint des Proxmox-Zertifikats"
  fi
fi
PROXMOX_ASKED=1

# ---------- 5. Version und Deploy-Dateien holen ----------
# Mit Wiederholung: kurze Netzaussetzer (Verbindung zurückgesetzt, 5xx) sollen die Installation nicht abbrechen.
gh_api() { curl -fsSL --retry 4 --retry-all-errors --retry-delay 3 -H "Authorization: Bearer $GHCR_TOKEN" -H "X-GitHub-Api-Version: 2022-11-28" "$@"; }

if [ -n "$FK_VERSION_WANTED" ]; then
  FK_VERSION="$FK_VERSION_WANTED"
elif [ -z "${FK_VERSION:-}" ]; then
  say "Neueste Version ermitteln"
  FK_VERSION=$(gh_api "https://api.github.com/repos/$FK_REPO/releases/latest" | jq -r .tag_name) \
    || die "Kein Release gefunden. Stimmt das Token?"
fi
[[ "$FK_VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "Ungültige Version: $FK_VERSION"
say "Version $FK_VERSION"

asset_url=$(gh_api "https://api.github.com/repos/$FK_REPO/releases/tags/$FK_VERSION" \
  | jq -r '.assets[] | select(.name=="fokus-deploy.tar.gz") | .url')
[ -n "$asset_url" ] || die "Release $FK_VERSION hat kein fokus-deploy.tar.gz."
tmp=$(mktemp -d)
gh_api -H "Accept: application/octet-stream" "$asset_url" -o "$tmp/deploy.tar.gz"
tar -xzf "$tmp/deploy.tar.gz" -C "$FK_DIR" compose.yaml backup.sh db/10-app-role.sh
rm -rf "$tmp"
mkdir -p "$FK_DIR/backups" "$FK_DIR/maintenance" "$FK_DIR/updates"

umask 077
cat >"$ENV_FILE" <<EOF
# Erzeugt von install.sh am $(date -Iseconds). Nie ins Repo committen.
FK_VERSION=$FK_VERSION
FK_IMAGE_PREFIX=ghcr.io/$(echo "$FK_REPO" | tr '[:upper:]' '[:lower:]')
PUBLIC_URL=$PUBLIC_URL
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
APP_DB_PASSWORD=$APP_DB_PASSWORD
BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET
SETUP_CODE=$SETUP_CODE
UPDATER_SECRET=$UPDATER_SECRET
CLOUDFLARE_TUNNEL_TOKEN=$CLOUDFLARE_TUNNEL_TOKEN
CLOUDFLARED_VERSION=${CLOUDFLARED_VERSION:-2026.9.3}
SMTP_HOST=$SMTP_HOST
SMTP_PORT=$SMTP_PORT
SMTP_USER=$SMTP_USER
SMTP_PASS='$SMTP_PASS'
SMTP_FROM='$SMTP_FROM'
GHCR_USER=$GHCR_USER
GHCR_TOKEN=$GHCR_TOKEN
TZ=${TZ:-Europe/Berlin}
BACKUP_KEEP_DAYS=${BACKUP_KEEP_DAYS:-30}
BACKUP_HOUR=${BACKUP_HOUR:-3}
PROXMOX_ASKED=$PROXMOX_ASKED
PROXMOX_URL=${PROXMOX_URL:-}
PROXMOX_NODE=${PROXMOX_NODE:-}
PROXMOX_VMID=${PROXMOX_VMID:-}
PROXMOX_TOKEN_ID=${PROXMOX_TOKEN_ID:-}
PROXMOX_TOKEN_SECRET=${PROXMOX_TOKEN_SECRET:-}
PROXMOX_TLS_FINGERPRINT=${PROXMOX_TLS_FINGERPRINT:-}
# Optional: Backup außer Haus (docs/betrieb.md). Ziel-Zugang in $FK_DIR/rclone.conf
OFFSITE_REMOTE=${OFFSITE_REMOTE:-}
AGE_RECIPIENT=${AGE_RECIPIENT:-}
OFFSITE_KEEP_DAYS=${OFFSITE_KEEP_DAYS:-30}
# Optional: Lebenszeichen nach dem täglichen Lauf an einen Uptime-Dienst
HEARTBEAT_URL=${HEARTBEAT_URL:-}
EOF
chmod 600 "$ENV_FILE"

# ---------- 6. Starten ----------
say "Images laden"
echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin >/dev/null
cd "$FK_DIR"
docker compose pull -q
say "Stack starten"
docker compose up -d

say "Auf die API warten"
for _ in $(seq 1 60); do
  if docker compose exec -T api node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
    ok=1; break
  fi
  sleep 2
done
[ "${ok:-}" = 1 ] || die "API startet nicht. Logs: cd $FK_DIR && docker compose logs api"

cat <<EOF

  FOKUS $FK_VERSION läuft.

  1. Öffne $PUBLIC_URL
  2. Setup-Code:  $SETUP_CODE

  Der Code steht auch in $ENV_FILE.
  Logs:     cd $FK_DIR && docker compose logs -f
  Backups:  $FK_DIR/backups (täglich ${BACKUP_HOUR:-3}:00 Uhr, ${BACKUP_KEEP_DAYS:-30} Tage)

EOF
