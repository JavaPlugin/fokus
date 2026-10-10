// Desktop: ⌘K / Strg+K Befehlspalette (Erfassen, Seite wechseln) und Tastenkürzel:
// N neue Aufgabe, 1–4 Seiten. Nie in Eingabefeldern, nur im Web.
import { afterSheets, font, glass, type, useBackClose, usePalette } from '@fokus/ui';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useApp } from '../lib/app';

const TABS = ['/', '/aufgaben', '/woche', '/fokus'] as const;

const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
};

type Cmd = { id: string; label: string; hint?: string; run: () => void };

export function CommandPalette() {
  const p = usePalette();
  const { setCaptureOpen, setQuickOpen } = useApp();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef<TextInput>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      // Offene Sheets/Dialoge nicht stören
      if (document.querySelector('[aria-modal="true"]')) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setCaptureOpen(true);
      } else if (/^[1-4]$/.test(e.key)) {
        e.preventDefault();
        router.navigate(TABS[Number(e.key) - 1]!);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setCaptureOpen]);

  useEffect(() => {
    if (!open) return;
    setQ('');
    setSel(0);
    setTimeout(() => input.current?.focus(), 30);
  }, [open]);

  const close = () => setOpen(false);
  // Wie jedes Sheet: Browser-Zurück schließt die Palette (gemeinsamer Verlaufs-Stapel)
  useBackClose(open, close);
  const commands: Cmd[] = useMemo(
    () => [
      { id: 'new', label: 'Neue Aufgabe', hint: 'N', run: () => setCaptureOpen(true) },
      { id: 't1', label: 'Heute', hint: '1', run: () => router.navigate('/') },
      { id: 't2', label: 'Aufgaben', hint: '2', run: () => router.navigate('/aufgaben') },
      { id: 't3', label: 'Woche', hint: '3', run: () => router.navigate('/woche') },
      { id: 'quick', label: 'Schnell notieren', run: () => setQuickOpen(true) },
      { id: 'hours', label: 'Arbeitszeiten', run: () => router.navigate('/arbeitszeiten') },
      { id: 't4', label: 'Fokus', hint: '4', run: () => router.navigate('/fokus') },
      { id: 'set', label: 'Profil und Einstellungen', run: () => router.navigate('/profil') },
      {
        id: 'dev',
        label: 'Kurzbefehle und Webhooks',
        run: () => router.navigate('/entwickler'),
      },
    ],
    [setCaptureOpen, setQuickOpen],
  );

  const items: Cmd[] = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? commands.filter((c) => c.label.toLowerCase().includes(needle)) : commands;
  }, [q, commands]);

  const run = (c: Cmd | undefined) => {
    if (!c) return;
    close();
    // Erst nachdem der eigene Verlaufseintrag weg ist (history.back ist asynchron) navigieren
    afterSheets(c.run);
  };

  if (Platform.OS !== 'web') return null;
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
      <Pressable
        accessibilityLabel="Schließen"
        onPress={close}
        {...glass('scrim')}
        style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)' }}
      />
      <View
        accessibilityViewIsModal
        style={{
          marginTop: '12%',
          width: '92%',
          maxWidth: 560,
          alignSelf: 'center',
          backgroundColor: p.surface,
          borderRadius: 18,
          overflow: 'hidden',
        }}
      >
        <TextInput
          ref={input}
          accessibilityLabel="Befehl"
          value={q}
          onChangeText={(v) => (setQ(v), setSel(0))}
          placeholder="Befehl …"
          placeholderTextColor={p.ink3}
          onKeyPress={(e) => {
            const k = e.nativeEvent.key;
            if (k === 'ArrowDown') setSel((s) => Math.min(items.length - 1, s + 1));
            else if (k === 'ArrowUp') setSel((s) => Math.max(0, s - 1));
            else if (k === 'Escape') close();
          }}
          onSubmitEditing={() => run(items[sel])}
          style={[type.body, { color: p.ink, padding: 16, fontSize: 17 }]}
        />
        <View style={{ borderTopWidth: 1, borderColor: p.surface2, paddingVertical: 6 }}>
          {items.map((c, i) => (
            <Pressable
              key={c.id}
              accessibilityRole="button"
              onPress={() => run(c)}
              onHoverIn={() => setSel(i)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                minHeight: 40,
                paddingHorizontal: 16,
                backgroundColor: i === sel ? p.surface2 : 'transparent',
              }}
            >
              <Text style={[type.body, { color: p.ink, flex: 1 }]} numberOfLines={1}>
                {c.label}
              </Text>
              {c.hint ? (
                <Text style={[type.small, { color: p.ink3, fontFamily: font.medium }]}>
                  {c.hint}
                </Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
}
