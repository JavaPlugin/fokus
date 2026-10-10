// Kleines, sicheres Markdown für Rechtstexte (ohne Abhängigkeit). Ergebnis sind Blöcke, die die
// App als Text darstellt: es entsteht nie HTML aus der Eingabe.
// - Überschriften (#, ##, ###), Absätze (Zeilenumbrüche bleiben), Listen (- oder *)
// - **fett**, [Text](Ziel): Link nur mit http(s): oder mailto:, sonst bleibt es Klartext
// - [[…]] = Stelle, die der Betreiber ausfüllen muss (gelb markiert)
// - {{betreiber}}, {{anschrift}}, {{email}} = Angaben aus Admin-Panel → Impressum (fillLegal)

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'bold'; v: string }
  | { t: 'link'; v: string; href: string }
  | { t: 'fill'; v: string };

export type Block =
  | { type: 'h'; level: 1 | 2 | 3; text: Inline[] }
  | { type: 'p'; text: Inline[] }
  | { type: 'ul'; items: Inline[][] };

/** Nur diese Ziele werden zu Links. */
export function safeHref(href: string): string | null {
  const h = href.trim();
  if (/^https?:\/\/[^\s<>"']+$/i.test(h)) return h;
  if (/^mailto:[^\s<>"']+$/i.test(h)) return h;
  return null;
}

const INLINE = /\*\*([^*]+)\*\*|\[\[([^\]]+)\]\]|\[([^\]]+)\]\(([^)\s]*)\)/g;

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  const text = (v: string) => {
    if (!v) return;
    const prev = out.at(-1);
    if (prev?.t === 'text') prev.v += v;
    else out.push({ t: 'text', v });
  };
  for (const m of src.matchAll(INLINE)) {
    text(src.slice(last, m.index));
    last = m.index + m[0].length;
    if (m[1] !== undefined) out.push({ t: 'bold', v: m[1] });
    else if (m[2] !== undefined) out.push({ t: 'fill', v: m[2] });
    else {
      const href = safeHref(m[4] ?? '');
      if (href) out.push({ t: 'link', v: m[3]!, href });
      else text(m[0]);
    }
  }
  text(src.slice(last));
  return out;
}

export function parseMarkdown(src: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: string[] | null = null;
  const flush = () => {
    if (para.length) blocks.push({ type: 'p', text: parseInline(para.join('\n')) });
    if (list) blocks.push({ type: 'ul', items: list.map(parseInline) });
    para = [];
    list = null;
  };
  for (const raw of src.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    const li = /^\s*[-*]\s+(.*)$/.exec(line);
    if (!line.trim()) flush();
    else if (h) {
      flush();
      blocks.push({ type: 'h', level: h[1]!.length as 1 | 2 | 3, text: parseInline(h[2]!) });
    } else if (li) {
      if (para.length) flush();
      (list ??= []).push(li[1]!);
    } else {
      if (list) flush();
      para.push(line.trim());
    }
  }
  flush();
  return blocks;
}

export interface LegalInfo {
  name: string;
  address: string;
  email: string;
}

/** Platzhalter mit den Impressumsangaben füllen; fehlt etwas, bleibt eine markierte Stelle. */
export function fillLegal(md: string, l: LegalInfo | null | undefined): string {
  const v = (x: string | undefined, what: string) => (x?.trim() ? x.trim() : `[[${what}]]`);
  return md
    .replace(/\{\{betreiber\}\}/g, v(l?.name, 'Name des Betreibers im Admin-Panel eintragen'))
    .replace(/\{\{anschrift\}\}/g, v(l?.address, 'Ladungsfähige Anschrift eintragen'))
    .replace(/\{\{email\}\}/g, v(l?.email, 'E-Mail-Adresse eintragen'));
}

export const LEGAL_KEYS = ['impressum', 'datenschutz', 'nutzungsbedingungen'] as const;
export type LegalKey = (typeof LEGAL_KEYS)[number];

/** Standardtexte, solange im Admin-Panel nichts gespeichert ist. Vor dem Start rechtlich prüfen. */
export const LEGAL_DEFAULTS: Record<LegalKey, string> = {
  impressum: `## Betreiber
{{betreiber}}
{{anschrift}}

E-Mail: {{email}}

FOKUS ist ein Dienst für die persönliche Tagesplanung. Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV ist der oben genannte Betreiber.`,

  datenschutz: `## Verantwortlich
{{betreiber}}, {{anschrift}}, {{email}}

## Welche Daten wir verarbeiten
Name und E-Mail-Adresse für Konto und Anmeldung, Passkeys (nur der öffentliche Schlüssel) und was du selbst einträgst: Aufgaben, Zeitblöcke, Fokus-Sitzungen, Notizen, Kalender-Abos und Einstellungen. Dazu Anmelde-Sitzungen mit IP-Adresse und Browser-Kennung, damit die Anmeldung sicher bleibt, sowie der Zeitpunkt, zu dem du den Nutzungsbedingungen zugestimmt hast.

## Zwecke und Rechtsgrundlagen
Bereitstellung von FOKUS nach den Nutzungsbedingungen (Art. 6 Abs. 1 lit. b DSGVO). Schutz vor Missbrauch, z. B. Begrenzung von Anmeldeversuchen, und Sicherheit des Dienstes (Art. 6 Abs. 1 lit. f DSGVO). Keine Werbung, kein Tracking, keine Analyse-Dienste, kein Verkauf und keine Auswertung deiner Daten.

## Empfänger und Auftragsverarbeiter
Hosting: [[Hoster und Standort des Servers]]. Verbindung über Cloudflare (Cloudflare, Inc.), das die übertragenen Anfragen technisch sieht. E-Mails (Anmeldelinks, Erinnerungen) verschickt [[E-Mail-Anbieter, z. B. Brevo; Auftragsverarbeitungsvertrag abgeschlossen]]. Push-Mitteilungen laufen über den Dienst deines Browser- oder Geräteherstellers (nur ein verschlüsselter Hinweis, kein Inhalt deiner Aufgaben).

Übermittlung in Drittländer (z. B. USA bei Cloudflare): [[Grundlage angeben, z. B. EU-US Data Privacy Framework oder Standardvertragsklauseln]].

Wer mit dir einen gemeinsamen Fokus-Block startet (Fokus-Partner), sieht dort deinen Namen und den Stand des Timers. Aufgaben, Plan und Auswertungen sieht niemand außer dir. Auch Betreiber und Admins sehen keine Inhalte, nur Anzahl und Umfang.

## Cookies und Speicher im Browser
Nur ein technisch nötiges Sitzungs-Cookie für die Anmeldung, deshalb gibt es keinen Cookie-Hinweis. Offline erfasste Einträge und Einstellungen wie der Privatmodus liegen im Speicher deines Browsers. Schriftarten werden mit der App ausgeliefert, nicht von fremden Servern geladen.

## Wie lange wir Daten speichern
Bis du dein Konto löschst. Danach sind die Daten sofort aus der Datenbank entfernt; in den verschlüsselten Sicherungen bleiben sie höchstens 30 Tage, dann werden diese gelöscht. Nicht bestätigte Registrierungen löschen wir nach 24 Stunden. Server-Protokolle: [[Aufbewahrung angeben]].

## Sicherheit
Verbindungen nur verschlüsselt (HTTPS). Jede Anfrage wird in der Datenbank auf dein Konto beschränkt. Sicherungen außerhalb des Servers sind verschlüsselt.

## Deine Rechte
Auskunft, Berichtigung, Löschung, Einschränkung, Widerspruch und Datenübertragbarkeit (Art. 15–21 DSGVO). Export und Konto löschen gehen direkt in der App unter Profil → Daten. Du kannst dich bei einer Datenschutz-Aufsichtsbehörde beschweren, z. B. [[zuständige Behörde]]. Eine automatisierte Entscheidung im Sinne von Art. 22 DSGVO findet nicht statt.`,

  nutzungsbedingungen: `## 1. Worum es geht
FOKUS ist ein Tagesplaner: Er plant Arbeit, Pausen und bewusste Social-Media-Zeit. Produktive Zeit verdient Scroll-Zeit. Anbieter ist {{betreiber}}. FOKUS ist kostenlos und ohne Werbung.

## 2. Konto
Für die Nutzung brauchst du ein Konto mit einer gültigen E-Mail-Adresse, die du selbst nutzt. Du meldest dich per Link oder Passkey an und hältst deine Geräte und dein Postfach vor fremdem Zugriff geschützt. Ein Konto pro Person.

## 3. Keine Sperre, keine Beratung
FOKUS plant mit den Angaben, die du einträgst, und erinnert dich. Es sperrt keine Apps und ersetzt keine ärztliche oder therapeutische Hilfe. FOKUS sieht nicht, welche Apps du öffnest; das Umleiten funktioniert nur über eine Automation, die du selbst auf deinem Gerät einrichtest.

## 4. Faire Nutzung
Nicht erlaubt sind: Missbrauch oder Störung des Dienstes, automatisierte Massenzugriffe, das Ausspähen fremder Daten, das Anlegen von Konten für andere ohne deren Zustimmung und rechtswidrige Inhalte, auch in Notizen und Aufgaben. Bei Verstößen kann das Konto gesperrt werden.

## 5. Fokus-Partner
Bei einem gemeinsamen Fokus-Block sehen sich die Beteiligten live (Name und Timer). Lade nur Menschen ein, die du kennst.

## 6. Verfügbarkeit und Änderungen
Wir bemühen uns um einen zuverlässigen Betrieb, können aber keine ununterbrochene Verfügbarkeit zusagen; für Wartung und Updates kann der Dienst kurz pausieren. Funktionen können sich weiterentwickeln. Über wesentliche Änderungen dieser Bedingungen informieren wir dich vorher.

## 7. Haftung
[[Haftungsregelung rechtlich prüfen lassen, z. B. unbeschränkt bei Vorsatz und grober Fahrlässigkeit sowie bei Verletzung von Leben, Körper und Gesundheit, sonst nur für wesentliche Pflichten und den vorhersehbaren Schaden]]

## 8. Ende der Nutzung
Du kannst dein Konto jederzeit in der App löschen (Profil → Daten). Vorher kannst du alles exportieren. Wir können die Nutzung mit angemessener Frist beenden, bei schweren Verstößen auch sofort.

## 9. Schlussbestimmungen
Es gilt deutsches Recht. [[Gerichtsstand und Verbraucherschlichtung angeben]]`,
};
