// Impressum, Datenschutz, Nutzungsbedingungen: Text aus der API (Admin-Panel → Rechtstexte), bis
// dahin und im statischen HTML der Standardtext. Platzhalter mit den Impressumsangaben gefüllt.
import { fillLegal, LEGAL_DEFAULTS, type LegalKey } from '@fokus/core';
import { Body, Button, Title } from '@fokus/ui';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { api } from '../lib/api';
import { usePublic } from '../lib/public';
import { BackButton, goBack } from './BackButton';
import { Fill, OperatorNote } from './Legal';
import { LegalLinks } from './LegalLinks';
import { Markdown } from './Markdown';
import { PageHead } from './PageHead';
import { Screen } from './Screen';

export type LegalDoc = { body: string; stand: string | null; version: number };

export function useLegal(key: LegalKey) {
  const [doc, setDoc] = useState<LegalDoc>({ body: LEGAL_DEFAULTS[key], stand: null, version: 0 });
  useEffect(() => {
    api<LegalDoc>(`/api/legal/${key}`)
      .then(setDoc)
      .catch(() => undefined);
  }, [key]);
  return doc;
}

export const standText = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString('de-DE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

export function LegalPage({
  docKey,
  title,
  description,
}: {
  docKey: LegalKey;
  title: string;
  description: string;
}) {
  const doc = useLegal(docKey);
  const legal = usePublic()?.legal;
  const body = fillLegal(doc.body, legal);
  return (
    <Screen>
      <PageHead title={title} description={description} social />
      <BackButton parent="/willkommen" label="Zurück" />
      <Title>{title}</Title>
      {body.includes('[[') ? <OperatorNote /> : null}
      <Markdown source={body} />
      <Body muted>
        Stand: {doc.stand ? <Text>{standText(doc.stand)}</Text> : <Fill>Datum</Fill>}
      </Body>
      <Button label="Zurück" variant="secondary" onPress={() => goBack('/willkommen')} />
      <LegalLinks />
    </Screen>
  );
}
