# Changelog

Alle Versionen von FOKUS. Installiert wird über Admin-Panel → System (Tag `vX.Y.Z` auf `main`).

## 1.1.0 – Einfacher und verständlicher

- **Eine Sache: die Aufgabe.** Art (Arbeit, Pause, Social), Dauer, Wann (automatisch, feste Zeit, später) und Wiederholung (täglich, werktags, wöchentlich). Notizen und Inbox entfallen, Notizen werden zu Aufgaben „Später“.
- **Arbeitszeiten** pro Wochentag (Standard Mo–Fr 09:00–17:00). FOKUS plant automatische Aufgaben nur dort und um feste Zeiten herum, automatisch bei jeder Änderung.
- **Heute** neu: Guthaben mit Erklärung, „Als Nächstes“ mit Start, Liste mit Kreis zum Erledigen (mit Rückgängig), freie Zeit mit Vorschlag und „Einplanen“.
- **Aufgaben** statt Inbox: Offen, Wiederkehrend, Erledigt. Antippen bearbeitet, nichts verschwindet durch Antippen. Löschen nur im Sheet oder per Wischen, immer mit Rückgängig.
- Wiederkehrende Aufgaben: erledigen und ändern geht pro Tag („Nur diese“ oder „Alle“).
- Privatmodus (Auge) und Energie-Abfrage entfernt. Einführung in drei Schritten.

## 1.0.0 – 10. Oktober 2026

Erster Stand von FOKUS: Tagesplaner, der Social Media einplant. Produktive Zeit verdient Scroll-Zeit. Details je Phase unten.

- **Behoben:** Im Dunkelmodus erschienen die statisch vorgerenderten Seiten (Willkommen, Umleiten) hell. Die Farben folgen jetzt dem System, auch beim Hydrieren.
- Screenshots in `docs/screenshots`, neues Vorschaubild, Version 1.0.0.

### Phase 6: Fokus-Partner und Smart Home

- Fokus-Partner: Im Fokus-Modus Partner per Link einladen, live sehen, wer mitarbeitet (nur Name und Fokus/Pause).
- Smart Home: Webhooks bei Start und Ende eines Fokus-Blocks, Anleitung für Home Assistant.

### Phase 5: Kalender, Energie, Lücken

- Kalender-Sync per ICS-Adresse (Google, Apple, Outlook): Termine blockieren Zeit im Tagesplan, Wiederholungen werden aufgelöst.
- Energie-Kalender: morgens Energie wählen; schwere Aufgaben kommen in die Hochphase (bei niedriger Energie zuletzt). Verlauf in der Woche.
- Lücken-Füller: freie 15 Minuten und mehr mit passenden kleinen Aufgaben zum Einplanen per Tipp.

### Phase 4: Woche

- Woche: „Vom Scrollen zurückgeholt“ als Zeit-Konto, Balken Fokus und Social pro Tag, Fokus-Zeit, Serie, Gegenwert in Kapiteln und Trainings, Wochen blättern.
- Profil → Planung: Länge von Fokus und Pause, Guthaben pro Stunde, Tageslimit, Arbeitstag, übliche Scroll-Zeit.

### Phase 3: Umleiten, Social-Slots, Erinnerungen

- Umleiten: Öffnest du Instagram, TikTok & Co. außerhalb eines Slots, zeigt FOKUS eine 2-Minuten-Aufgabe. Optionen: Aufgabe machen (+3 Min.), 10 Min. vom Guthaben nehmen, trotzdem öffnen. Anleitung für die iPhone-Kurzbefehle in der Einführung und im Profil.
- Social-Slots als eigene Termine, Guthaben wird beim Start abgezogen.
- Erinnerungen vor Fokus-Block und Social-Slot sowie Tagesrückblick am Abend (Push und/oder E-Mail).

### Phase 2: Screens

- Heute: Scroll-Guthaben als große Zahl, aktueller Fokus-Block als Karte, Tagesliste mit Uhrzeiten, „Tag planen“.
- Fokus-Modus mit Timer-Ring, Guthaben-Hinweis, Pause und Erledigt; Fokus-Tab zum Starten.
- Inbox mit Notizen und Aufgaben, Plus-Knopf zum schnellen Erfassen.

### Phase 1: Kern

- Aufgaben, Inbox, Zeitblöcke (Fokus, Pause, Social, Termin), Tagesplan, Fokus-Timer-Durchgänge und Scroll-Guthaben (1 Std. Fokus = 15 Min., einstellbar, mit Tageslimit) in Kern, Datenbank und API.
- Tagesplan verteilt Aufgaben in freie Zeit, schneidet sie in Fokus-Blöcke mit Pausen, legt schwere Aufgaben in Hochphasen und lässt Mini-Aufgaben für Lücken und „Umleiten“ übrig.
- Lücken-Füller, Serie und Wochen-Zeit-Konto als reine Funktionen mit Tests.
- Notizen per Kurzbefehl in die Inbox (`/api/v1/inbox`).
- Export/Import enthält alle neuen Daten.

### Phase 0: Fundament

- Monorepo (pnpm + Turbo), CI, Release mit cosign-Signatur (neues Schlüsselpaar), Compose, Installer, Updater mit Rollback und Backups.
- API: Anmeldung per Link und Passkey, Setup-Assistent, Registrierung, Mandantentrennung mit Row Level Security, Audit-Log, Nutzerverwaltung, Rechtstexte, E-Mail-Vorlagen, Benachrichtigungen, Webhooks, API-Schlüssel, Export/Import des eigenen Kontos.
- Web: Admin-Panel (System, Nutzer, Audit, Backups, Protokoll, Impressum, Rechtstexte, E-Mail-Vorlagen), Willkommen, Anmeldung, Einführung, Profil, Sicherheit, Darstellung, Privatmodus, ⌘K, Tabs Heute · Woche · Inbox · Fokus (noch ohne Inhalt).
- Datenbank-Migrationen neu ab 0000 (Anmeldung, System, Einstellungen, Push, Webhooks).
