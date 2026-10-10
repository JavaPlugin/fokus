# FOKUS

Tagesplaner als gehosteter Dienst (PWA): **Produktive Zeit verdient Scroll-Zeit.** Die App plant Arbeit, Pausen und bewusste Social-Slots. Wer zur falschen Zeit scrollen will, bekommt eine kleine Aufgabe als Alternative statt einer Sperre.
Betrieb (nur für den Betreiber, Rolle `admin`): Docker-Compose-Stack auf einer Proxmox-VM hinter einem Cloudflare Tunnel, Updates als GitHub-Release per Klick im Admin-Panel. Betreiber-Doku: `docs/betrieb.md`. Nach außen nie als Selbst-Hosting-Lösung bewerben.

Auftrag und Konzept: `PROMPT.md`. Design-Entwürfe: `design/` (HTML, im Browser öffnen). Fundament ist Kontoblick (`JavaPlugin/kontoblick3`, privat) ohne Finanz-Code.

## Stand

| Phase | Inhalt                                                                                         | Status |
| ----- | ---------------------------------------------------------------------------------------------- | ------ |
| 0     | Vorlage übernehmen: Monorepo, CI, Compose, Anmeldung, Setup, Admin-Panel, Updater, Rechtstexte | fertig |
| 1     | Kern: Aufgaben, Zeitblöcke, Tagesplan, Scroll-Guthaben (+ Tests)                               | offen  |
| 2     | Screens Heute, Fokus-Modus, Inbox laut `design/`                                               | offen  |
| 3     | Umleiten, Social-Slots, Push-Erinnerungen                                                      | offen  |
| 4     | Woche: Zeit-Konto, Serie, Rückblick                                                            | offen  |
| 5     | Kalender-Sync, Energie-Kalender, Lücken-Füller                                                 | offen  |
| 6     | Fokus-Partner, Smart-Home-Webhooks                                                             | offen  |
| 1.0   | Einführung, Willkommensseite, E2E-Tests, Screenshots, Release `v1.0.0`                         | offen  |

## Entscheidungen

- Phase 0: Alles `kontoblick`/`KB_`/`kb.` heißt jetzt `fokus`/`FK_`/`fk.` (Pakete `@fokus/*`, DB-Rolle `fokus_app`, Env `FK_VERSION`, `FK_E2E`, `FK_SELFTEST_BROKEN`, Speicher-Schlüssel `fk.*`, Webhook-Header `X-FOKUS-*`, API-Schlüssel `fk_…`).
- Phase 0: Migrationen neu ab 0000: `0000_init` (drizzle) + `0001_rls` (von Hand: Rolle `fokus_app`, RLS-Schleife über alle Fachtabellen, Policies für API-Schlüssel-Nachschlagen und Admin-Kontext). Jede neue Fachtabelle mit `user_id` braucht in ihrer Migration dasselbe wie die Schleife in `0001_rls.sql` (Test `rls.test.ts` prüft es).
- Phase 0: Export/Import des eigenen Kontos über `EXPORT_TABLES` in `apps/api/src/data-routes.ts` (Tabellen in Einfügereihenfolge, `ids`/`refs` für UUIDv5-Umbenennung fremder Dateien). Neue Fachtabellen dort eintragen.
- Phase 0: Privatmodus verbirgt statt Beträgen jetzt Texte mit `dataSet={{ private: '' }}` (Aufgabentitel, Notizen).
- Phase 0: Tabs Heute · Woche · (+) · Inbox · Fokus, Plus-Knopf öffnet `CaptureSheet` (Notiz für die Inbox, speichert ab Phase 2). Gemeinsamer Zustand `apps/web/src/lib/app.tsx` (`useApp`), ersetzt `useBudget`.
- Phase 0: `admin/geloescht.tsx` (Splits) entfällt. `/api/admin/usage` liefert `{ tasks, lastSeen }` (Aufgaben kommen mit Phase 1).
- Phase 0: Benachrichtigungsarten `focus`, `social`, `recap` (`user_settings.notify`), Standardkanal App. Der tägliche Lauf (`createReminderJob`) macht nur noch Aufräumen und die Update-Mail; Erinnerungen vor Blöcken (minutengenau) kommen in Phase 3.
- Phase 0: Webhook-Ereignisse `focus.started`, `focus.ended` (`apps/api/src/events.ts`). API-Schlüssel-Recht `inbox:create`, `/api/v1/inbox` kommt in Phase 1.
- Phase 0: E-Mail-Vorlagen `erinnerung`, `rueckblick`, `anmeldung`, `einladung` (Fokus-Partner), `update`; `renderMail` kennt `hero: { big, small }` statt Euro-Betrag.
- Phase 0: Updater: `servername` beim Proxmox-TLS nur bei Hostnamen (Node 25 verbietet IP als SNI-Name).
- Phase 0: Neues cosign-Schlüsselpaar: öffentlich `deploy/cosign.pub`, privat als PEM in `../cosign-fokus.key` (außerhalb des Repos, nie committen). Betreiber-Aufgabe: Inhalt als GitHub-Secret `COSIGN_PRIVATE_KEY` im Repo `JavaPlugin/fokus` anlegen, dann die Datei löschen oder sicher ablegen.
- Phase 0: `pnpm` lokal über `npm i -g pnpm@12.8.1` installiert (Node 25.8). Playwright-Chromium einmalig: `pnpm exec playwright install chromium`.

- Phase 1: Kern in `packages/core`: `model.ts` (Typen, `DEFAULT_SETTINGS`: 50/10 Min., 15 Min. pro Std., Tageslimit 90, Fenster 09:00–18:00, Basis 67 Min. Scroll-Zeit pro Tag, Serie ab 60 Min.), `credit.ts` (verdienen `earnedFor` = abgerundet, `spend` begrenzt durch Guthaben und Tageslimit, Tag immer in Berlin), `plan.ts` (`planDay`: freie Zeit = Fenster minus Belegtes, Raster 5 Min., Reihenfolge fällig → schwer → lang, schwere zuerst in Hochphasen, Blöcke ≤ Fokus-Länge, Pause nach vollem Block wenn danach noch Arbeit, kürzeste Reststücke 10 Min., Mini-Aufgaben nie fest), `gaps.ts` (Lücken ab 15 Min., `suggestForGap`, `pickRedirectTask` = Mini bis 2 Min.), `streak.ts`, `week.ts` (Zeit-Konto: Basis × vergangene Tage − Social, nie negativ). Zeitzonen-Helfer in `dates.ts` (`instant`, `dayInZone`, `clock`, `weekStart`).
- Phase 1: Tabellen `task`, `time_block` (Art focus/pause/social/event, `source` plan/manual/calendar), `focus_session`, `credit_entry` (Buch: Plus verdient, Minus ausgegeben), `inbox_item`; Planungs-Einstellungen in `user_settings.plan` (Teilmenge, Rest aus `DEFAULT_SETTINGS`). Migration `0002_tasks` + `0003_tasks_rls` (inkl. `admin_read` auf `task` für die Zählwerte im Admin-Panel).
- Phase 1: API `apps/api/src/task-routes.ts` (Aufgaben, Inbox, `/api/v1/inbox` mit Schlüssel) und `day-routes.ts` (`/api/plan/settings`, `/api/day/:day` mit Lücken und Vorschlägen, Blöcke, `POST /api/plan/:day` ersetzt nur Geplantes aus der Planung (`source=plan`, heute nur ab jetzt), `/api/focus/start|finish|current`, `/api/credit`, `/api/credit/spend`). Neue Datensätze dürfen eine eigene ID mitbringen (wiederholbar für die Offline-Warteschlange). Fokus-Ende: gearbeitet = Timer-Dauer, höchstens geplante Zeit + 30 Min.; unter 1 Min. = abgebrochen ohne Guthaben. Ein Fokus-Block gleichzeitig (409). Webhook-Ereignisse `focus.started`/`focus.ended` werden hier ausgelöst.
- Phase 1: Social-Slots geben Guthaben über `POST /api/credit/spend` (Grund `social`) aus, „10 Min. vom Guthaben nehmen“ mit Grund `redirect`. Die Social-Zeit der Woche = Summe der Ausgaben beider Gründe.

- Phase 2: Gemeinsamer Tagesstand im Client `apps/web/src/lib/day.tsx` (`DayProvider`/`useDay`: Tag, Notizen, Aktionen; lädt erst nach `reload()` aus dem Tab-Layout, danach jede Minute und bei Rückkehr). Seiten: `(tabs)/index.tsx` (Heute), `(tabs)/fokus.tsx` (Starter), `(tabs)/inbox.tsx`, Vollbild `app/fokus-modus.tsx` (Timer-Ring aus `@fokus/ui` `Ring`, Pause = Fokus beenden + Pause-Uhr, „Weiter fokussieren“ = neuer Durchgang), `components/BlockSheet.tsx` (Block starten/erledigen/überspringen/löschen; Social-Slot gibt Guthaben aus), `CaptureSheet` (Plus: Inbox oder direkt Aufgabe mit Dauer). UI-Bausteine `packages/ui/src/fokus.tsx` (`KindCard`, `Ring`, `BlockRow`), `Hero` zeigt Zahl + Einheit, Farben `kindScreens` in `theme.ts`.
- Phase 2: Eine PWA kann „Nicht stören“ nicht schalten: der Chip im Fokus-Modus heißt „Fokus läuft“ (Entwurf: „Nicht stören an“). Dafür gibt es später Webhooks/Kurzbefehle.
- Phase 2: Unter einer Minute gearbeitet = Durchgang abgebrochen, Block übersprungen, kein Guthaben (die Aufgabe gilt bei „Erledigt“ trotzdem als erledigt).
- Phase 2: Screenshots: `SHOTS=1 pnpm e2e screenshots` → `docs/screenshots`; Beispiel-Guthaben über `POST /api/e2e/credit` (nur mit `FK_E2E=1`).

- Phase 3: Umleiten: Seite `app/umleiten.tsx` (`/umleiten?app=instagram`, nur angemeldet), API `apps/api/src/redirect-routes.ts` (`GET /api/redirect`: im Social-Slot → erlaubt, sonst `pickRedirectTask` (Mini bis 2 Min.) oder Vorschlagstext; `POST /api/redirect/done`: Bonus `redirectBonus` (3 Min.), höchstens 3 pro Tag; „10 Min. vom Guthaben“ = `/api/credit/spend` mit `reason: redirect`, Menge `redirectSpend`). App-Liste und Schemata (`instagram://` …) in `REDIRECT_APPS`. Einführung (Schritt 3) und Profil-Kachel mit `components/RedirectGuide.tsx` (iPhone-Kurzbefehle-Automation „Wenn App geöffnet → URL öffnen“).
- Phase 3: Social-Slots: `components/SocialSheet.tsx` (in 30 Min. / volle Stunden, 10–45 Min.), Start im `BlockSheet` zieht Guthaben ab.
- Phase 3: Erinnerungen `apps/api/src/reminders.ts`: jede Minute (Server mit `jobs: true`), 5 Min. vor Fokus-Block/Social-Slot (Schlüssel `block:{id}`), Tagesrückblick ab 20 Uhr Berlin (`recap:{tag}`, nur bei Aktivität). Liest über `withAdmin` (Migration `0004` gibt `admin_read` auf `time_block`, `focus_session`, `credit_entry`).

- Phase 4: `GET /api/week/:tag` (`week-routes.ts`): Fokus je Tag aus fertigen `focus_session`, Social je Tag aus ausgegebenem Guthaben (`spentOn`), Zeit-Konto `weekSummary` (Basis `baselineScroll` × vergangene Tage − Social), Serie über 120 Tage, erledigte Aufgaben. Screen `(tabs)/woche.tsx` (Balken Fokus/Social, Wochenwechsel, Gegenwert `equivalents`: Kapitel ≈ 2 Std., Training ≈ 2,5 Std.). Rückblick = Tagesrückblick (Phase 3) plus Zeile mit bestem Tag und erledigten Aufgaben auf der Woche. Profil → Planung (`components/PlanSettings.tsx`) stellt Fokus/Pause/Guthaben/Limit/Arbeitstag/Basis ein.

## Befehle

```bash
pnpm install          # einmalig; pnpm 12 (npm i -g pnpm@12.8.1)
pnpm dev              # API (localhost:3000, PGlite) + Web (localhost:8081)
pnpm test             # Vitest in allen Paketen
pnpm lint             # ESLint + Prettier-Check (pnpm format behebt Formatierung)
pnpm typecheck
pnpm --filter @fokus/db generate --name <was>   # Migration nach Schema-Änderung
pnpm --filter @fokus/web build                 # statischer Export + Service Worker nach apps/web/dist
pnpm --filter @fokus/updater dev:mock          # Updater-Attrappe (Port 8090) fürs Admin-Panel, MOCK_FAIL=1 = Rollback
pnpm --filter @fokus/web build && pnpm e2e     # Browser-Tests (Playwright)
```

Lokal: `cp apps/api/.env.example apps/api/.env`. Mails landen in der Entwicklung im API-Log (kein SMTP nötig). Setup-Code dort: `dev-setup-code`.

## Ordner

```
apps/api        Hono auf Node 24. Better Auth (Magic Link, Passkey, Admin), Setup-Assistent, /health
apps/web        Expo SDK 57 + Expo Router, als statische PWA exportiert. Routen in src/app/ (admin/ = Admin-Panel)
apps/updater    Einziger Dienst mit Docker-Socket: Updates, Rollback, Backups. Nur im Netz ops, nur mit UPDATER_SECRET
packages/core   Reine Funktionen (Plan, Guthaben, Serie, Woche, Lücken), Datums- und Markdown-Helfer
packages/db     Drizzle-Schema, Migrationen in drizzle/ (nur vorwärts), createDb (Postgres oder PGlite)
packages/ui     Design-Tokens, Farbwelt, Glas, Sheets, Symbole
deploy/         compose.yaml, Caddyfile, Dockerfiles, install.sh, proxmox-create-vm.sh, backup.sh
design/         HTML-Entwürfe der Screens
docs/           Betrieb (nur Betreiber), Screenshots
e2e/            Playwright-Tests
```

## Konventionen

- **Zeit:** Zeitpunkte als ISO-Text (UTC), Dauer in ganzen Minuten. Tage `YYYY-MM-DD` (Europe/Berlin).
- **IDs:** UUID.
- **Texte:** kurz, Deutsch, Du-Form.
- **Design:** eine Hero-Zahl pro Screen, Farbe nur mit Bedeutung: **Fokus = Blau** (`#5AC8FA`), **Pause = Grün** (`#30D158`), **Social = Violett** (`#BF5AF2`), Warnung = Orange (`kindColors` in `packages/ui/src/theme.ts`). Alle Farbwerte nur dort (Test `packages/core/test/nohex.test.ts`). Nur Geist, Zahlen mit `tabular-nums`, Hell/Dunkel.
- **Rechenlogik:** `packages/core`, nie ohne Test ändern.
- **Migrationen:** nur vorwärts. Nach Schema-Änderung `generate` ausführen, CI prüft das.
- **Sicherheit:** jede Anfrage prüft, ob der Nutzer die Daten sehen darf. Fachdaten nur über `withUser(db, userId, fn)` lesen und schreiben: setzt Rolle `fokus_app` und `app.user_id`, RLS (FORCE) filtert jede Tabelle. Neue Fachtabellen brauchen `user_id` und gehören in die RLS-Liste (wie `0001_rls.sql`), in `EXPORT_TABLES` und in die Angriffsliste von `tenancy.test.ts`.
- **Git:** ein Branch und ein PR pro Phase, Conventional Commits (`feat:`, `fix:`, `chore:` …). Release = Tag `vX.Y.Z`. Kein `gh` lokal: der Nutzer legt PRs über die GitHub-Oberfläche an und merged.
- **Secrets und Echtdaten:** nie im Repo. `.env.example` pflegen, echte Werte erzeugt `install.sh`.
- **Abhängigkeiten:** keine neuen ohne Begründung (unten eintragen). Kein Tracking.

## Begründete Abhängigkeiten

- `@electric-sql/pglite`: Postgres im Prozess für Entwicklung und Tests ohne Docker. In Produktion nie geladen.
- `better-auth`, `@better-auth/passkey`: Anmeldung per Magic Link und Passkey, selbst gehostet.
- `nodemailer`: SMTP für Anmeldelinks und Einladungen.
- `workbox-cli` (dev): erzeugt den Service Worker für die App-Shell.
- `@expo-google-fonts/geist`: Geist-Schriftdateien, werden mit der App ausgeliefert.
- `cosign` (nur im Updater-Image, feste Version mit Prüfsumme): prüft die Signatur von Release-Images.
- `expo-document-picker`: Datei wählen für den Import.
- `react-native-svg`: Icons als SVG, Teil von Expo.
- `web-push`: Push-Mitteilungen (VAPID), ohne fremden Dienst außer dem Push-Server des Browsers.
- `@playwright/test` (dev): Browser-Tests, in CI mit Chromium.

## Update-System

- Ablauf in `apps/updater/src/updater.ts` (Tests mit unechtem Docker in `updater.test.ts`): Release laden → Images ziehen → **cosign verify** → Wartung an → pg_dump → optional Proxmox-Snapshot → Dateien + `FK_VERSION` tauschen → `compose up` → Health-Check (60 s + 15 s stabil). Scheitert er: alte Dateien, `pg_restore` des Dumps, alte Version.
- Nur Upgrades, Rollback nur auf die direkt vorherige Version. Versionen streng per Regex, Befehle nie über eine Shell.
- Wartungsmodus: Datei `/opt/fokus/maintenance/on`, Caddy liefert dann `maintenance.html` (503). Fortschritt in `maintenance/status.json`.
- Releases werden mit eigenem Schlüssel signiert (Secret `COSIGN_PRIVATE_KEY`, öffentlich `deploy/cosign.pub`), cosign v2.6.5.
- Neue Dateien, die mit einem Release ausgeliefert werden, in `DEPLOY_FILES` (updater.ts), im Deploy-Paket (release.yml) und in `install.sh` ergänzen.
- Tags `-broken` → API mit `FK_SELFTEST_BROKEN=1` (/health immer 503), zum Prüfen des Rollbacks.

## Stolperfallen

- pnpm 12: Einstellungen stehen in `pnpm-workspace.yaml` (`nodeLinker: hoisted` für Metro, `allowBuilds`), nicht in `.npmrc`.
- `npx expo install` und `pnpm add --filter …` hinterlassen im hoisted-Layout manchmal kaputte Pakete. Abhilfe: Dev-Server stoppen, `rm -rf node_modules apps/*/node_modules packages/*/node_modules && pnpm install`.
- Magic Links gehen nur an bestehende Nutzer (`auth.ts`), damit niemand über unseren SMTP fremde Adressen anschreibt.
- BSD-`sed` (macOS) kennt kein `\b`; für Massen-Umbenennungen `perl -pi -e` nehmen.
- Prettier ignoriert `PROMPT.md` und `design/` (`.prettierignore`).
