import { LegalPage } from '../components/LegalPage';

/** Nutzungsbedingungen. Text unter Admin-Panel → Rechtstexte; vor dem Start prüfen lassen. */
export default function Nutzungsbedingungen() {
  return (
    <LegalPage
      docKey="nutzungsbedingungen"
      title="Nutzungsbedingungen"
      description="Die Bedingungen für die Nutzung von FOKUS."
    />
  );
}
