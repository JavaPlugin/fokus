import { Body, Title } from '@fokus/ui';
import { HeadButtons } from '../../components/HeadButtons';
import { Screen, type ScreenHead } from '../../components/Screen';

/** Fokus: Platzhalter, bis die Screens kommen (Phase 2). */
export default function Fokus() {
  const head: ScreenHead = { title: 'Fokus', right: <HeadButtons /> };
  return (
    <Screen head={head}>
      <Title>Fokus</Title>
      <Body muted>Timer für deinen Fokus-Block, mit Pause und Fokus-Partner.</Body>
    </Screen>
  );
}
