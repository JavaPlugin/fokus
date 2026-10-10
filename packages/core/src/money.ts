/** Beträge immer als ganze Cent. 1234 = 12,34 € */
export type Cents = number;

const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

/** 123402 → "1.234,02 €" */
export function formatEUR(cents: Cents): string {
  return eur.format(cents / 100);
}

/** Euro-Float aus der alten App in Cent, ohne Fließkomma-Fehler (0.1 + 0.2). */
export function toCents(euro: number): Cents {
  return Math.round(euro * 100);
}

/** Zerlegt für die Hero-Darstellung: Euro groß, Cent und „€“ klein. */
export function splitEUR(cents: Cents): { sign: '' | '−'; euros: string; cents: string } {
  const abs = Math.abs(cents);
  const euros = new Intl.NumberFormat('de-DE').format(Math.floor(abs / 100));
  return { sign: cents < 0 ? '−' : '', euros, cents: String(abs % 100).padStart(2, '0') };
}
