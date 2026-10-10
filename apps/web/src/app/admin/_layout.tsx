// Admin-Panel nur für Admins: alle anderen landen im Profil (die API prüft ohnehin jede Route).
import { usePalette } from '@fokus/ui';
import { Redirect, Stack } from 'expo-router';
import { useMe } from '../../components/HeadButtons';

export default function AdminLayout() {
  const p = usePalette();
  const me = useMe();
  if (me && me.role !== 'admin') return <Redirect href="/profil" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: p.bg } }} />;
}
