// Früher Einstellungen, jetzt Profil. Alte Links und Lesezeichen landen dort.
import { Redirect } from 'expo-router';

export default function Einstellungen() {
  return <Redirect href="/profil" />;
}
