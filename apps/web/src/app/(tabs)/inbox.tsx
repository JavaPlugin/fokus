import { Body, Title } from '@fokus/ui';
import { HeadButtons } from '../../components/HeadButtons';
import { Screen, type ScreenHead } from '../../components/Screen';

/** Inbox: Platzhalter, bis die Screens kommen (Phase 2). */
export default function Inbox() {
  const head: ScreenHead = { title: 'Inbox', right: <HeadButtons /> };
  return (
    <Screen head={head}>
      <Title>Inbox</Title>
      <Body muted>Schnell notieren, FOKUS plant später ein.</Body>
    </Screen>
  );
}
