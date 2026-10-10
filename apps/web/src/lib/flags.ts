// Schalter für Funktionen, die vorbereitet, aber noch nicht eingeschaltet sind.
export const flags = {
  /**
   * Werbung: höchstens eine Karte im App-Stil (`SponsorCard`), geplant nur am Ende des
   * Rückblicks. Aus, solange Datenschutzerklärung und Nutzungsbedingungen das nicht abdecken.
   */
  ads: false,
  /** Kachel „FOKUS unterstützen“ im Profil (Spenden/Abo, noch ohne Ziel). */
  support: false,
} as const;
