# Changelog

Alle Versionen von FOKUS. Installiert wird über Admin-Panel → System (Tag `vX.Y.Z` auf `main`).

## Unveröffentlicht

### Phase 0: Fundament

- Monorepo (pnpm + Turbo), CI, Release mit cosign-Signatur (neues Schlüsselpaar), Compose, Installer, Updater mit Rollback und Backups.
- API: Anmeldung per Link und Passkey, Setup-Assistent, Registrierung, Mandantentrennung mit Row Level Security, Audit-Log, Nutzerverwaltung, Rechtstexte, E-Mail-Vorlagen, Benachrichtigungen, Webhooks, API-Schlüssel, Export/Import des eigenen Kontos.
- Web: Admin-Panel (System, Nutzer, Audit, Backups, Protokoll, Impressum, Rechtstexte, E-Mail-Vorlagen), Willkommen, Anmeldung, Einführung, Profil, Sicherheit, Darstellung, Privatmodus, ⌘K, Tabs Heute · Woche · Inbox · Fokus (noch ohne Inhalt).
- Datenbank-Migrationen neu ab 0000 (Anmeldung, System, Einstellungen, Push, Webhooks).
