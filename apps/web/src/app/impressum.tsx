import { LegalPage } from '../components/LegalPage';

/** Impressum (§ 5 DDG). Text unter Admin-Panel → Rechtstexte, Angaben unter Impressum. */
export default function Impressum() {
  return (
    <LegalPage
      docKey="impressum"
      title="Impressum"
      description="Angaben zum Betreiber von FOKUS."
    />
  );
}
