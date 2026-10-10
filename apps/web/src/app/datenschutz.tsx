import { LegalPage } from '../components/LegalPage';

/** Datenschutzerklärung (DSGVO). Text unter Admin-Panel → Rechtstexte; vor dem Start prüfen lassen. */
export default function Datenschutz() {
  return (
    <LegalPage
      docKey="datenschutz"
      title="Datenschutz"
      description="Welche Daten FOKUS speichert, wofür und wie lange. Kein Tracking, keine Werbung."
    />
  );
}
