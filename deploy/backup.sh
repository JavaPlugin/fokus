#!/bin/sh
# Nächtlicher pg_dump nach /backups, ältere als BACKUP_KEEP_DAYS werden gelöscht.
# Ein Dump lässt sich mit pg_restore auf einer neuen VM wiederherstellen (docs/betrieb.md).
# Verschlüsselte Kopie außer Haus: macht der Updater (apps/updater/src/offsite.ts).
set -eu

run_backup() {
  ts=$(date +%Y-%m-%d_%H%M)
  tmp="/backups/.fokus_$ts.dump.tmp"
  pg_dump --format=custom --no-owner --file="$tmp"
  mv "$tmp" "/backups/fokus_$ts.dump"
  # Gilt für nächtliche, manuelle und Update-Sicherungen
  find /backups -name '*.dump' -mtime +"$BACKUP_KEEP_DAYS" -delete
  echo "[backup] fokus_$ts.dump geschrieben"
}

[ "${1:-}" = "now" ] && { run_backup; exit 0; }

while true; do
  now=$(date +%s)
  next=$(date -d "today ${BACKUP_HOUR}:00" +%s)
  [ "$next" -le "$now" ] && next=$(date -d "tomorrow ${BACKUP_HOUR}:00" +%s)
  sleep $((next - now))
  run_backup || echo "[backup] FEHLER" >&2
done
