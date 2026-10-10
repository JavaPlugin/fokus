# FOKUS: Betrieb

Nur für den Betreiber des Dienstes. Endnutzer registrieren sich einfach in der App.

Entwicklung: siehe [CLAUDE.md](../CLAUDE.md).

## Installation auf Proxmox

Du brauchst:

- eine **Domain** in Cloudflare und einen **Tunnel**: Cloudflare Zero Trust → Networks → Tunnels → „Create a tunnel“ (Cloudflared). Token kopieren. Unter „Public Hostname“ die Adresse (z. B. `fokus.deinedomain.de`) auf `http://caddy:80` zeigen lassen.
- ein **GitHub-Token** für das private Repo: GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic), Scopes `repo` und `read:packages`. Fine-grained Tokens können keine Images aus GHCR laden. Das Token liegt nur in `/opt/fokus/.env` (Rechte 600).
- einen **SMTP-Zugang** (Host, Port, Benutzer, Passwort, Absender) für Anmeldelinks.

### 1. VM anlegen (auf dem Proxmox-Host)

```bash
bash proxmox-create-vm.sh --ssh-key /root/.ssh/id_ed25519.pub
```

Legt VM 210 an: Debian 13, 2 vCPU, 4 GB RAM, 32 GB Disk, Login nur per SSH-Schlüssel. Optionen stehen oben im Skript (`--vmid`, `--storage`, `--bridge`, `--ip`).

### 2. FOKUS installieren (auf der VM)

```bash
ssh fokus@<IP>
sudo -i
export GHCR_TOKEN=<token>
curl -fsSL -H "Authorization: Bearer $GHCR_TOKEN" -H "Accept: application/vnd.github.raw" \
  https://api.github.com/repos/JavaPlugin/fokus/contents/deploy/install.sh -o install.sh
bash install.sh
```

Das Skript installiert Docker, schließt die Firewall (eingehend nur SSH), fragt Adresse, Tunnel-Token und SMTP ab, erzeugt alle Secrets und startet den Stack unter `/opt/fokus`. Am Ende zeigt es den **Setup-Code**.

### 3. Einrichten (im Browser)

Öffne deine Adresse, gib den Setup-Code ein, prüfe die Adresse, leg dein Admin-Konto an (der Anmeldelink testet den Mailversand) und richte Face ID ein. Danach auf dem iPhone in Safari: Teilen → „Zum Home-Bildschirm“.

### Updates (Admin-Panel)

Einstellungen → **System**. Dort steht die installierte Version, ein verfügbares Update mit Changelog und „Jetzt installieren“. Der Updater:

1. lädt die Images und prüft ihre Signatur (`deploy/cosign.pub`),
2. schaltet die Wartungsseite an und sichert die Datenbank (`backups/vor-update_*.dump`),
3. macht optional einen Proxmox-Snapshot der VM,
4. startet die neue Version (Migrationen laufen dabei) und prüft 60 s lang `/health`.

Kommt die neue Version nicht sauber hoch, geht alles automatisch zurück: alte Version, Datenbank von vor dem Update. Das Protokoll steht unter System → Update-Protokoll. Dort gibt es auch „Zurück auf vX“ für die direkt vorherige Version.

**Einmaliger Umstieg von v0.2.0 auf v0.3.0** (der Updater existiert davor noch nicht), auf der VM:

```bash
cd /opt/fokus && GHCR_TOKEN=$(grep "^GHCR_TOKEN=" .env | cut -d= -f2-)
curl -fsSL -H "Authorization: Bearer $GHCR_TOKEN" -H "Accept: application/vnd.github.raw" https://api.github.com/repos/JavaPlugin/fokus/contents/deploy/install.sh -o install.sh
FK_VERSION=v0.3.0 bash install.sh
```

`install.sh` behält alle Secrets und Daten, ergänzt `UPDATER_SECRET` und fragt einmal nach dem Proxmox-Snapshot.

Wichtig: In einer Shell, in der die `.env` mit `set -a; . ./.env` geladen wurde, keine `docker compose`-Befehle ausführen. Compose bevorzugt Shell-Variablen vor der `.env` und würde alte Werte (z. B. eine alte `FK_VERSION`) nehmen. Im Zweifel `exit` und neu anmelden.

### Proxmox-Snapshot vor Updates (optional)

1. Proxmox → Datacenter → Permissions → **Users**: Benutzer `fokus@pve` anlegen.
2. Permissions → **API Tokens**: Token `updater` für diesen Benutzer, „Privilege Separation“ an. Secret kopieren.
3. Permissions → **Add → User Permission**: Pfad `/vms/<VMID>`, Benutzer `fokus@pve`, Rolle **PVEVMAdmin**.
4. Permissions → **Add → API Token Permission**: Pfad `/vms/<VMID>`, Token `fokus@pve!updater`, Rolle **PVEVMAdmin**. Mit „Privilege Separation“ darf das Token nur, was Benutzer **und** Token beide dürfen, deshalb braucht es beide Einträge.
5. Fingerprint: Node → System → **Certificates** → `pve-ssl.pem` → „View Certificate“ → SHA-256-Fingerprint.
6. Werte bei `install.sh` eingeben oder in `/opt/fokus/.env` eintragen (`PROXMOX_URL`, `PROXMOX_NODE`, `PROXMOX_VMID`, `PROXMOX_TOKEN_ID`, `PROXMOX_TOKEN_SECRET`, `PROXMOX_TLS_FINGERPRINT`), dann `docker compose up -d updater`.

Der Updater behält die letzten 3 Snapshots `fk-*`.

### Backups

- Täglich um 3 Uhr ein `pg_dump` nach `/opt/fokus/backups`, dazu vor jedem Update. Alles 30 Tage aufbewahrt (`BACKUP_KEEP_DAYS`; ältere Installationen haben in der `.env` noch 14, auf 30 ändern).
- Ansehen, herunterladen, „Jetzt sichern“ und **Wiederherstellen** unter System → Backups. Vor dem Wiederherstellen wird der aktuelle Stand gesichert.
- Wiederherstellen auf einer **neuen VM**: `install.sh` ausführen, Setup überspringen, Backup nach `/opt/fokus/backups` kopieren, dann:

  ```bash
  cd /opt/fokus
  docker compose stop api
  docker compose exec -T db dropdb -U postgres --force fokus
  docker compose exec -T db createdb -U postgres -O fokus_app fokus
  docker compose exec -T db pg_restore -U postgres -d fokus --no-owner --role=fokus_app < backups/<datei>.dump
  docker compose start api
  ```

- Zusätzlich in Proxmox einen nächtlichen Backup-Job für die ganze VM anlegen.

### Backup außer Haus (3-2-1, optional)

Der Updater verschlüsselt jede neue Sicherung mit [age](https://age-encryption.org) und kopiert sie per rclone an ein Ziel außerhalb der VM (S3, Hetzner Storage Box, SFTP …). Auf dem Server liegt nur der öffentliche Schlüssel.

1. Auf deinem Rechner (nicht auf dem Server): `age-keygen -o fokus-backup.key`. Die Datei sicher aufbewahren (Passwortmanager, Tresor). Ohne sie lassen sich die Kopien nicht entschlüsseln.
2. Den ausgegebenen öffentlichen Schlüssel (`age1…`) in `/opt/fokus/.env` als `AGE_RECIPIENT` eintragen.
3. Ziel einrichten: `rclone config` (auf einem beliebigen Rechner), die entstandene Konfiguration nach `/opt/fokus/rclone.conf` kopieren (Rechte 600). In der `.env`: `OFFSITE_REMOTE=<remote>:fokus`, optional `OFFSITE_KEEP_DAYS=30`.
4. `docker compose up -d updater`. Stündlich werden neue Sicherungen hochgeladen, am Ziel wird nach 30 Tagen gelöscht. Stand und Fehler: System → Backups.
5. Wiederherstellen: Datei herunterladen, `age -d -i fokus-backup.key datei.dump.age > datei.dump`, dann wie oben mit `pg_restore`.

### Uptime-Überwachung

- Von außen `https://<adresse>/` überwachen (z. B. UptimeRobot, Better Stack, ein eigenes Uptime Kuma auf einem anderen Rechner). `/health` ist nur intern erreichbar.
- Lebenszeichen des täglichen Laufs (Erinnerungen, Aufräumen): beim Dienst einen Heartbeat-Monitor („Cron“) mit 24 h plus Toleranz anlegen und dessen URL als `HEARTBEAT_URL` in die `.env` eintragen, dann `docker compose up -d api`. Bleibt der Ping aus, meldet der Dienst den Ausfall.

### E-Mail-Versand

- Anbieter mit Auftragsverarbeitungsvertrag (AVV), z. B. Brevo: AVV im Konto abschließen und ablegen.
- DNS der Absender-Domain: SPF (vom Anbieter vorgegebener `include`), DKIM (vom Anbieter erzeugte Schlüssel), DMARC (mindestens `v=DMARC1; p=quarantine; rua=mailto:…`). Prüfen mit einer Testmail aus dem Admin-Panel und z. B. mail-tester.com.

### Datenschutz im Betrieb

- Konto löschen (in der App) entfernt alle Fachdaten sofort. In lokalen und externen Sicherungen bleiben sie höchstens 30 Tage.
- Unbestätigte Registrierungen löscht der tägliche Lauf nach 24 Stunden.
- Admin-Aktionen stehen im Audit-Log (System → Audit-Log). Admins sehen keine Inhalte anderer Nutzer.
- Vor dem öffentlichen Start: Impressum (Admin-Panel), gelb markierte Stellen in Datenschutz und Nutzungsbedingungen ausfüllen und rechtlich prüfen lassen.

## Releases (für Entwickler)

Ein Release entsteht mit einem Tag: `git tag v0.3.1 && git push origin v0.3.1`. Die Images werden mit dem eigenen Schlüssel signiert. Dafür braucht das Repo **einmalig** das Secret `COSIGN_PRIVATE_KEY` (Settings → Secrets and variables → Actions → New repository secret, Inhalt: der private Schlüssel als PEM). Der öffentliche Teil liegt in `deploy/cosign.pub` und steckt im Updater-Image.

Tags mit Bindestrich (`v0.3.1-broken`) werden Pre-Releases. `-broken` baut eine API, die sich absichtlich nie gesund meldet: damit lässt sich der automatische Rollback prüfen (Admin-Panel → „Testversionen anzeigen“).
