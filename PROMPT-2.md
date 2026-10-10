# FOKUS – Auftrag 2: einfacher und verständlicher

Die App läuft, ist aber schwer zu verstehen. Überarbeite sie nach den neuen Screens in `design/`. Arbeite wie in `PROMPT.md` selbstständig ohne Rückfragen, ein Branch `phase-ux`, am Ende Tests grün und Branch pushen.

## Was nicht stimmt (Feedback vom Nutzer)

1. Oben rechts auf „Heute“ ist das **Auge** (Privatmodus aus Kontoblick). In FOKUS gibt es keine Beträge → **Privatmodus komplett entfernen** (Knopf, `lib/privacy.tsx`, Einstellung in „Darstellung“).
2. Man kann nur **Notizen** anlegen. Es fehlen: **Uhrzeit**, **Dauer**, **Wiederholung**, **Arbeitszeiten**.
3. Tippt man in der **Inbox** auf einen Eintrag, ist er **einfach weg**. Niemals durch Antippen löschen oder erledigen.
4. Insgesamt unklar: Was ist das Guthaben? Was heißt „Lücken“? Was macht „Neu planen“?

## Neues Modell (eine Sache: die Aufgabe)

Es gibt keine Notizen und keine Inbox mehr, nur **Aufgaben**. Felder:

| Feld        | Werte                                                                                                           |
| ----------- | --------------------------------------------------------------------------------------------------------------- |
| Titel       | Text                                                                                                            |
| Art         | Arbeit (blau) · Pause (grün) · Social (violett)                                                                 |
| Dauer       | 15 Min · 30 Min · 1 Std · 2 Std · eigene                                                                        |
| Wann        | **Automatisch** (FOKUS plant in die Arbeitszeit) · **Feste Zeit** (Tag + Uhrzeit) · **Später** (noch ohne Zeit) |
| Wiederholen | Nie · Täglich · Werktags · Wöchentlich (Wochentage wählbar)                                                     |
| Status      | offen · erledigt (mit Zeitpunkt)                                                                                |

- Wiederkehrende Aufgaben: eine Regel (`recurrence`), daraus entstehen Vorkommen pro Tag. Erledigt wird nur das Vorkommen, nicht die Regel. Bearbeiten fragt: „Nur diese“ oder „Alle“.
- Bestehende Inbox-Einträge per Migration zu Aufgaben mit „Später“, 30 Min, Art Arbeit.

## Arbeitszeiten

Neue Seite **Arbeitszeiten** (erreichbar über Avatar → Profil, siehe `design/4-arbeitszeiten.html`):

- Pro Wochentag an/aus + Beginn/Ende. Standard Mo–Fr 09:00–17:00.
- Dazu die Regeln: Fokus-Block-Länge + Pause, Guthaben pro Fokus-Stunde, Social-Slot (Uhrzeit, Dauer).
- Der Planer (`packages/core/src/plan.ts`) legt **automatische** Aufgaben nur in Arbeitszeit und um feste Termine herum. Feste Zeiten gehen immer, auch außerhalb.
- Ersteinrichtung: Arbeitszeiten als Schritt in der Einführung.

## Screens

**Heute** (`design/1-heute.html`)

- Kopf: Datum links, Avatar rechts. **Kein Auge.**
- Hero: Scroll-Guthaben + **eine Zeile Erklärung** („Je 1 Std. Fokus bekommst du 15 Min. für Social Media.“).
- Karte „Als Nächstes“: nächste Aufgabe mit Uhrzeit, Dauer, Guthaben-Gewinn, Knopf **Start** → Fokus-Modus.
- Liste „Heute“ mit „Arbeitszeit 09:00–17:00“ rechts. Jede Zeile: Kreis (antippen = erledigt, mit Rückgängig-Toast), Titel, „Uhrzeit · Dauer · automatisch geplant / feste Zeit / täglich“. Zeile antippen = Aufgabe bearbeiten.
- „Lücken“ ersetzen durch eine gestrichelte Zeile **„15:20–17:00 frei · Vorschlag: …“** mit Knopf **Einplanen**.
- „Neu planen“ nur noch automatisch im Hintergrund (bei neuer/geänderter Aufgabe) oder klein im ⌘K-Menü.
- Leerer Tag: „Noch nichts geplant“ + Knopf „Aufgabe anlegen“.

**Aufgaben** (statt Inbox, `design/2-aufgaben.html`)

- Umschalter: Offen · Wiederkehrend · Erledigt.
- Offen gruppiert: „Heute eingeplant“, „Noch ohne Zeit“ (mit Knopf „Einplanen“ → automatisch), später „Diese Woche“.
- Kreis = erledigt (Toast „… erledigt · Rückgängig“, 5 s, wie `lib/undo.tsx`). Antippen = Bearbeiten-Sheet. Löschen nur im Bearbeiten-Sheet oder per Wischen nach links (`SwipeRow`), immer mit Rückgängig.
- Hinweiszeile unten: „Kreis antippen = erledigt. Aufgabe antippen = bearbeiten.“

**Neue Aufgabe / Bearbeiten** (`design/3-neue-aufgabe.html`)

- Ein `Sheet` wie in Kontoblick, gleich für Anlegen und Bearbeiten. Reihenfolge: Was? · Art · Wie lange? · Wann? (bei „Feste Zeit“ Tag + Uhrzeit mit den Pickern aus `packages/ui/src/dates.tsx`) · Wiederholen (bei „Wöchentlich“ Wochentage).
- Erklärung unter „Wann?“: „Automatisch = FOKUS sucht einen freien Platz in deiner Arbeitszeit.“
- Schnell erfassen (Plus lange drücken / ⌘K) darf bleiben: legt eine Aufgabe „Später, 30 Min“ an.

**Tab-Leiste:** Heute · Aufgaben · (+) · Woche · Fokus.

## Verständlichkeit allgemein

- Jeder Begriff einmal erklärt, wo er zuerst auftaucht (Guthaben, Social-Slot, automatisch geplant).
- Keine Aktion ohne sichtbares Ergebnis: jede Änderung zeigt einen Toast, Löschen/Erledigen immer mit Rückgängig.
- Einführung (3 Schritte): 1. Was ist FOKUS (Guthaben-Prinzip in einem Satz), 2. Arbeitszeiten, 3. Erste Aufgabe anlegen.
- Kontoblick-Reste prüfen und entfernen: Privatmodus, „€“-Texte, Finanz-Begriffe, unpassende Profil-Kacheln.

## Tests

- Kern: Planer mit Arbeitszeiten, festen Zeiten, Wiederholungen (täglich, werktags, wöchentlich), Vorkommen erledigen.
- E2E: Aufgabe mit fester Zeit anlegen → steht in Heute; Kreis antippen → erledigt + Rückgängig; Antippen öffnet Bearbeiten (verschwindet nicht); wöchentliche Aufgabe erscheint am richtigen Tag.
