import { Body, Title } from '@fokus/ui';
import { HeadButtons } from '../../components/HeadButtons';
import { Screen, type ScreenHead } from '../../components/Screen';

/** Woche: Platzhalter, bis die Screens kommen (Phase 2). */
export default function Woche() {
  const head: ScreenHead = { title: 'Woche', right: <HeadButtons /> };
  return (
    <Screen head={head}>
      <Title>Woche</Title>
      <Body muted>Zeit-Konto, Fokus und Social pro Tag, Serie.</Body>
    </Screen>
  );
}
