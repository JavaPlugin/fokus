// Login-Schutz für alle App-Seiten (nicht nur die Tabs): ohne Sitzung → Willkommen, nach dem
// Anmelden zurück zur Ziel-Seite. Bis die Prüfung durch ist, liegt eine deckende Fläche über der
// Seite (der Navigator muss im Wurzel-Layout immer gerendert sein). Ohne Sitzung liefert die API
// ohnehin nichts (zentral 401); die Fläche verhindert, dass überhaupt eine App-Seite erscheint.
import { usePalette } from '@fokus/ui';
import { router, usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { bootState } from '../lib/api';
import { isPublicPath } from '../lib/nav';

type State = 'checking' | 'ready' | 'login' | 'setup';
/** Einmal bestätigt gilt für die Seite (Abmelden lädt neu, 401 meldet überall ab). */
let confirmed = false;
/**
 * Adresse beim Laden: Während nur die deckende Fläche steht, schreibt der Router die Adresse um
 * (/aufgabe/x → /?id=x). Als Ziel nach dem Anmelden gilt daher die ursprüngliche.
 */
let initial: string | null =
  typeof window !== 'undefined' && !isPublicPath(window.location.pathname)
    ? window.location.pathname + window.location.search
    : null;

export function AuthGate() {
  const p = usePalette();
  const path = usePathname();
  const open = isPublicPath(path);
  const [state, setState] = useState<State>(confirmed ? 'ready' : 'checking');

  useEffect(() => {
    if (open || confirmed) return;
    let alive = true;
    setState('checking');
    bootState()
      .then((b) => {
        if (!alive) return;
        if (b.kind === 'ready') confirmed = true;
        setState(b.kind === 'ready' ? 'ready' : b.kind);
      })
      .catch(() => alive && setState('login'));
    return () => {
      alive = false;
    };
  }, [open, path]);

  useEffect(() => {
    if (open) return;
    if (state === 'setup') router.replace('/setup');
    if (state === 'login') {
      // Ziel merken (auch mit Suchparametern): nach dem Anmelden geht es dorthin zurück
      const next =
        initial ??
        (typeof window !== 'undefined' ? window.location.pathname + window.location.search : path);
      initial = null;
      router.replace({ pathname: '/willkommen', params: { next } });
    }
  }, [state, open, path]);

  if (open || state === 'ready') return null;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, { backgroundColor: p.bg, zIndex: 1000 }]}
    />
  );
}
