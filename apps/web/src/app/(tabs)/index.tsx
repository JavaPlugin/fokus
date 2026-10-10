import { Body, Title } from '@fokus/ui';
import { HeadButtons } from '../../components/HeadButtons';
import { Screen, type ScreenHead } from '../../components/Screen';

/** Heute: Platzhalter, bis die Screens kommen (Phase 2). */
export default function Heute() {
  const head: ScreenHead = { title: 'Heute', right: <HeadButtons /> };
  return (
    <Screen head={head}>
      <Title>Heute</Title>
      <Body muted>
        Dein Tag auf einen Blick: Scroll-Guthaben, aktueller Fokus-Block und Tagesliste.
      </Body>
    </Screen>
  );
}
