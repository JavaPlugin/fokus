# FOKUS – Auftrag für Claude Code

Baue die App **FOKUS** komplett, von Phase 0 bis 1.0. Arbeite selbstständig durch alle Phasen.

## Arbeitsweise (wenig Unterbrechungen)

- Frag nur bei Dingen, die sich nicht rückgängig machen lassen (Löschen von Daten, Push auf `main`, Server, Kosten). Alles andere entscheidest du selbst und notierst es kurz in `CLAUDE.md` unter „Entscheidungen“.
- Plane jede Phase kurz in einer Aufgabenliste und arbeite sie ab, ohne auf Bestätigung zu warten.
- Pro Phase: ein Branch, Conventional Commits, `pnpm lint && pnpm typecheck && pnpm test` grün, dann Branch pushen und mit der nächsten Phase weitermachen. Ich merge die PRs über die GitHub-Oberfläche (kein `gh` lokal).
- Fehler behebst du selbst. Erst nach 3 erfolglosen Versuchen an derselben Stelle melden.
- Am Ende jeder Phase: Phase-Tabelle in `CLAUDE.md` auf „fertig“ setzen, `CHANGELOG.md` ergänzen.
- Antworten an mich: kurz, Deutsch.

## Was FOKUS ist

Ein Tagesplaner, der Social Media nicht verbietet, sondern einplant: **Produktive Zeit verdient Scroll-Zeit.** Die App plant Arbeit, Pausen und bewusste Social-Slots. Wer zur falschen Zeit scrollen will, bekommt eine kleine Aufgabe als Alternative statt einer Sperre.

Kernfunktionen:

1. **Tagesplan:** Aufgaben eingeben, die App verteilt sie in freie Zeitblöcke.
2. **Fokus-Blöcke:** Timer (Standard 50 Min. Arbeit, 10 Min. Pause), „Erledigt“ und „Pause“.
3. **Scroll-Guthaben:** 1 Std. Fokus = 15 Min. Guthaben (einstellbar). Social-Slots ziehen vom Guthaben ab.
4. **Social-Slots:** Social Media als eigene Termine im Kalender.
5. **Umleiten:** Öffnet man Instagram/TikTok außerhalb eines Slots, zeigt FOKUS eine 2-Minuten-Aufgabe. Optionen: Aufgabe machen · 10 Min. vom Guthaben nehmen · trotzdem öffnen.
6. **Inbox:** Schnell notieren, die App plant später ein.
7. **Woche:** Zeit-Konto („vom Scrollen zurückgeholt“), Fokus- vs. Social-Zeit pro Tag, Serie.
8. **Energie-Kalender:** Energie-Level morgens abfragen; schwere Aufgaben in Hochphasen.
9. **Lücken-Füller:** Freie 15 Min. → passende Mini-Aufgaben vorschlagen.
10. **Fokus-Partner:** Gemeinsam einen Fokus-Block starten, live sichtbar.
11. **Smart Home:** Webhook beim Start/Ende eines Fokus-Blocks.

## Fundament: Kontoblick als Vorlage

Vorlage ist das Repo `JavaPlugin/kontoblick3` (privat). Klone es neben das neue Projekt und lies zuerst dessen `CLAUDE.md`. Übernimm **Aufbau, Betrieb, Admin-Panel und Design**, aber **keinen Finanz-Code**.

Übernehmen (kopieren und auf FOKUS umbenennen, `@kontoblick/*` → `@fokus/*`):

- Monorepo: pnpm 12 + Turbo, TypeScript, ESLint, Prettier, `pnpm-workspace.yaml`, CI-Workflows (`ci.yml`, `images.yml`, `release.yml` mit cosign-Signatur; **neues** Schlüsselpaar erzeugen).
- `apps/api`: Hono, Better Auth (Magic Link, Passkey, Admin), Setup-Assistent, Registrierung (`signup.ts`), Mandantentrennung mit `withUser` + FORCE-RLS, Audit-Log, Nutzerverwaltung (`users.ts`), Rechtstexte (`legal.ts`), E-Mail-Vorlagen, Benachrichtigungen (`notify.ts`, `push.ts`), Webhooks, API-Schlüssel, SEO, Export/Import des eigenen Kontos. Zugehörige Tests (`tenancy`, `rls`, `admin-only`, `anonymous` …) mitnehmen.
- `apps/web` – **Admin-Panel genau wie bei Kontoblick:** `app/admin/` (System & Updates, Nutzer, Audit, Backups, Protokoll, Impressum, Rechtstexte, E-Mail-Vorlagen). `geloescht.tsx` (Splits) weglassen oder für gelöschte Aufgabenlisten anpassen. Dazu Login, Registrieren, Einladung, Setup, Sicherheit, Profil, Einführung, Willkommen, Impressum/Datenschutz/Nutzungsbedingungen, `AuthGate`, `Screen`, `TabBar`, `PagerTabs`, `CommandPalette`, `UpdateBanner`, `InstallGuide`, Undo, Privatmodus, Darstellung.
- `apps/updater`: unverändert übernehmen (Updates per Klick, Rollback, Backups, Proxmox-Snapshot, Offsite-Backup).
- `packages/ui`: Farbwelt, Geist, Glas, Sheets, Symbole – Design bleibt identisch.
- `packages/db`: Aufbau + Better-Auth-/System-Tabellen. **Migrationen neu ab 0000** (keine Finanz-Tabellen).
- `deploy/`: Compose, Caddyfile (CSP), Dockerfiles, `install.sh`, `proxmox-create-vm.sh`, `backup.sh`.

Weglassen: Budgets, Konten, Buchungen, Splits, Regeln, Rücklage, Prognose, CSV-Import, Rechenkern-Referenztest.

Betrieb: eigene Proxmox-VM, eigener Cloudflare Tunnel, Adresse `fokus.prism-kollektiv.de`, SMTP über Brevo, Images in GHCR. Nach außen nie als Selbst-Hosting bewerben.

## Design

Die Screens liegen in `design/` (öffnen im Browser):

- `1-heute.html` – Scroll-Guthaben als Hero-Zahl, aktueller Fokus-Block als Karte, Tagesliste mit Uhrzeiten.
- `2-fokus-modus.html` – großer Timer-Ring, Guthaben-Hinweis, Fokus-Partner.
- `3-umleiten.html` – Vorschlag statt Sperre.
- `4-woche.html` – zurückgeholte Zeit, Balken Fokus/Social pro Tag, Serie.

Regeln (wie Kontoblick): eine Hero-Zahl pro Screen, Farbe nur mit Bedeutung, alle Farbwerte nur in `packages/ui/src/theme.ts` (Hex-Test übernehmen), Geist, Zahlen mit `tabular-nums`, Hell/Dunkel. Farbzuordnung: **Fokus = Blau** (`#5AC8FA`), **Pause = Grün** (`#30D158`), **Social = Violett** (`#BF5AF2`), Warnung = Orange. Tabs: Heute · Woche · (+) · Inbox · Fokus. Texte kurz, Deutsch, Du-Form.

## Technik der neuen Teile

- **`packages/core`** (reine Funktionen, mit Tests): `plan.ts` (Aufgaben in freie Blöcke verteilen, Energie berücksichtigen), `credit.ts` (Guthaben verdienen/ausgeben, Tageslimit), `streak.ts`, `week.ts` (Zeit-Konto), `gaps.ts` (Lücken-Füller). Zeiten als ISO, Dauer in ganzen Minuten.
- **DB-Tabellen** (alle mit `user_id` + RLS): `task`, `time_block` (Art: focus/pause/social/event), `focus_session`, `credit_entry`, `inbox_item`, `calendar_feed`, `focus_room`.
- **Kalender-Sync:** ICS-Abo-URLs (Google/Apple) serverseitig lesen, Termine als belegte Blöcke.
- **Umleiten ohne App Store:** Eine PWA sieht nicht, welche App geöffnet wird. Lösung: Route `/umleiten?app=instagram` + Anleitung in der Einführung für eine iPhone-Kurzbefehle-Automation („Wenn Instagram geöffnet wird → URL öffnen“), mit Mini-Illustration wie `InstallGuide`.
- **Fokus-Partner:** Einladungslink + SSE wie die Splits in Kontoblick.
- **Push:** Erinnerung vor Fokus-Block und Social-Slot, Tagesrückblick abends.

## Phasen

| Phase | Inhalt |
| --- | --- |
| 0 | Vorlage übernehmen: Monorepo, CI, Compose, Anmeldung, Setup, **Admin-Panel**, Updater, Rechtstexte – ohne Finanz-Code. Läuft lokal mit `pnpm dev`. |
| 1 | Kern: Aufgaben, Zeitblöcke, Tagesplan, Scroll-Guthaben (+ Tests) |
| 2 | Screens Heute, Fokus-Modus, Inbox laut `design/` |
| 3 | Umleiten, Social-Slots, Push-Erinnerungen |
| 4 | Woche: Zeit-Konto, Serie, Rückblick |
| 5 | Kalender-Sync, Energie-Kalender, Lücken-Füller |
| 6 | Fokus-Partner, Smart-Home-Webhooks |
| 1.0 | Einführung, Willkommensseite, E2E-Tests, Screenshots, Release `v1.0.0` |

Starte jetzt mit Phase 0. Lege zuerst `CLAUDE.md` (nach Kontoblick-Muster, mit dieser Phasentabelle) an.
