// E-Mail-Vorlagen: Texte bearbeiten mit Platzhaltern, Vorschau live (Hell/Dunkel), Testmail.
// Vorschau als <iframe sandbox srcdoc>: kein Laden von der API (Caddy verbietet Frames), keine Skripte.
import {
  Body,
  Button,
  Chip,
  Chips,
  Field,
  Notice,
  Segmented,
  Title,
  usePalette,
  colors,
} from '@fokus/ui';
import { createElement, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { BackButton } from '../../components/BackButton';
import { ConfirmSheet, type Confirm } from '../../components/ConfirmSheet';
import { Screen } from '../../components/Screen';
import { api } from '../../lib/api';

type FieldKey = 'betreff' | 'ueberschrift' | 'hinweis' | 'button' | 'fusszeile';
type Texts = Record<FieldKey, string>;
type Tpl = {
  key: string;
  label: string;
  placeholders: string[];
  defaults: Texts;
  fields: Texts;
  custom: boolean;
};
type List = { fields: { key: FieldKey; label: string }[]; templates: Tpl[] };

const PH = /\{\{\s*([^{}\s]+)\s*\}\}/g;
const MULTI: FieldKey[] = ['hinweis', 'fusszeile'];

export default function Vorlagen() {
  const p = usePalette();
  const [list, setList] = useState<List | null>(null);
  const [sel, setSel] = useState('erinnerung');
  const [draft, setDraft] = useState<Texts | null>(null);
  const [dark, setDark] = useState<'light' | 'dark'>('light');
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [msg, setMsg] = useState<{ tone: 'positive' | 'negative'; text: string } | null>(null);
  const [busy, setBusy] = useState<'save' | 'test' | 'reset' | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const focus = useRef<{ field: FieldKey; start: number; end: number }>({
    field: 'betreff',
    start: 0,
    end: 0,
  });

  useEffect(() => {
    api<List>('/api/admin/email-templates')
      .then((l) => {
        setList(l);
        setDraft(l.templates.find((t) => t.key === sel)?.fields ?? null);
      })
      .catch((e: Error) => setMsg({ tone: 'negative', text: e.message }));
  }, []);

  const tpl = list?.templates.find((t) => t.key === sel);
  const dirty = !!tpl && !!draft && JSON.stringify(tpl.fields) !== JSON.stringify(draft);

  /** Unbekannte Platzhalter je Feld (wie die API). */
  const bad = useMemo(() => {
    const out: Partial<Record<FieldKey, string[]>> = {};
    if (!tpl || !draft) return out;
    for (const k of Object.keys(draft) as FieldKey[]) {
      const b = [...draft[k].matchAll(PH)]
        .map((m) => m[1]!)
        .filter((n) => !tpl.placeholders.includes(n));
      if (b.length) out[k] = [...new Set(b)];
    }
    return out;
  }, [tpl, draft]);
  const missing =
    !!draft && (!draft.betreff.trim() || !draft.ueberschrift.trim() || !draft.button.trim());
  const valid = !Object.keys(bad).length && !missing;

  // Vorschau 400 ms nach dem Tippen
  useEffect(() => {
    if (!draft || !valid) return;
    const t = setTimeout(() => {
      api<{ subject: string; html: string }>(`/api/admin/email-templates/${sel}/preview`, {
        body: { fields: draft, dark: dark === 'dark' },
      })
        .then(setPreview)
        .catch(() => undefined);
    }, 400);
    return () => clearTimeout(t);
  }, [draft, dark, sel, valid]);

  function pick(key: string) {
    setSel(key);
    setDraft(list?.templates.find((t) => t.key === key)?.fields ?? null);
    setMsg(null);
  }

  function set(k: FieldKey, v: string) {
    setDraft((d) => (d ? { ...d, [k]: v } : d));
  }

  /** Platzhalter an der letzten Cursor-Position des zuletzt fokussierten Felds einfügen. */
  function insert(name: string) {
    if (!draft) return;
    const { field, start, end } = focus.current;
    const cur = draft[field];
    const at = Math.min(start, cur.length);
    const to = Math.min(Math.max(end, at), cur.length);
    const token = `{{${name}}}`;
    set(field, cur.slice(0, at) + token + cur.slice(to));
    focus.current = { field, start: at + token.length, end: at + token.length };
  }

  function replaceTpl(fields: Texts, custom: boolean) {
    setList((l) =>
      l
        ? {
            ...l,
            templates: l.templates.map((t) => (t.key === sel ? { ...t, fields, custom } : t)),
          }
        : l,
    );
    setDraft(fields);
  }

  async function run(kind: 'save' | 'test' | 'reset') {
    if (!draft) return;
    setBusy(kind);
    setMsg(null);
    try {
      if (kind === 'save') {
        const r = await api<{ fields: Texts; custom: boolean }>(
          `/api/admin/email-templates/${sel}`,
          { method: 'PUT', body: { fields: draft } },
        );
        replaceTpl(r.fields, r.custom);
        setMsg({ tone: 'positive', text: 'Gesichert. Neue E-Mails nutzen die Texte.' });
      } else if (kind === 'reset') {
        const r = await api<{ fields: Texts; custom: boolean }>(
          `/api/admin/email-templates/${sel}`,
          { method: 'DELETE' },
        );
        replaceTpl(r.fields, r.custom);
        setMsg({ tone: 'positive', text: 'Auf Standard zurückgesetzt.' });
      } else {
        await api(`/api/admin/email-templates/${sel}/test`, { body: { fields: draft } });
        setMsg({ tone: 'positive', text: 'Testmail ist unterwegs.' });
      }
    } catch (e) {
      setMsg({ tone: 'negative', text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen title="E-Mail-Vorlagen">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <BackButton parent="/admin" label="System" />
        <Pressable
          accessibilityRole="button"
          disabled={!dirty || !valid || !!busy}
          onPress={() => run('save')}
          style={{ opacity: dirty && valid && !busy ? 1 : 0.4, padding: 8 }}
        >
          <Text style={{ color: p.ink, fontSize: 17, fontWeight: '600' }}>Sichern</Text>
        </Pressable>
      </View>
      <Title>E-Mail-Vorlagen</Title>
      <Chips>
        {(list?.templates ?? []).map((t) => (
          <Chip key={t.key} label={t.label} selected={t.key === sel} onPress={() => pick(t.key)} />
        ))}
      </Chips>

      <Segmented
        value={dark}
        onChange={setDark}
        options={[
          { value: 'light', label: 'Hell' },
          { value: 'dark', label: 'Dunkel' },
        ]}
      />
      {preview ? <Body muted>Betreff: {preview.subject}</Body> : null}
      {preview
        ? createElement('iframe', {
            title: 'Vorschau',
            sandbox: '',
            srcDoc: preview.html,
            style: {
              width: '100%',
              height: 560,
              border: 0,
              borderRadius: 14,
              background: dark === 'dark' ? colors.dark.bg : colors.light.surface,
            },
          })
        : null}

      {tpl && tpl.placeholders.length ? (
        <View style={{ gap: 6 }}>
          <Text style={{ color: p.ink2, fontSize: 13 }}>Platzhalter einfügen</Text>
          <Chips>
            {tpl.placeholders.map((n) => (
              <Chip key={n} label={`{{${n}}}`} onPress={() => insert(n)} />
            ))}
          </Chips>
        </View>
      ) : null}

      {draft && list
        ? list.fields.map((f) => (
            <View key={f.key} style={{ gap: 4 }}>
              <Field
                label={f.label}
                value={draft[f.key]}
                multiline={MULTI.includes(f.key)}
                style={MULTI.includes(f.key) ? { minHeight: 72 } : undefined}
                onChangeText={(v) => set(f.key, v)}
                onFocus={() =>
                  (focus.current = {
                    field: f.key,
                    start: draft[f.key].length,
                    end: draft[f.key].length,
                  })
                }
                onSelectionChange={(e) =>
                  (focus.current = { field: f.key, ...e.nativeEvent.selection })
                }
              />
              {bad[f.key] ? (
                <Notice tone="negative">
                  Unbekannter Platzhalter: {bad[f.key]!.map((n) => `{{${n}}}`).join(', ')}
                </Notice>
              ) : null}
            </View>
          ))
        : null}
      {missing ? (
        <Notice tone="warning">Betreff, Überschrift und Button brauchen Text.</Notice>
      ) : null}
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      <Button
        label="Testmail an mich senden"
        variant="secondary"
        loading={busy === 'test'}
        disabled={!valid}
        onPress={() => run('test')}
      />
      <Button
        label="Auf Standard zurücksetzen"
        variant="secondary"
        disabled={!tpl?.custom && !dirty}
        loading={busy === 'reset'}
        onPress={() =>
          tpl?.custom
            ? setConfirm({
                title: `${tpl.label} zurücksetzen?`,
                text: 'Deine Texte werden durch die Standardtexte ersetzt.',
                label: 'Zurücksetzen',
                run: () => run('reset'),
              })
            : tpl && setDraft(tpl.defaults)
        }
      />
      <Body muted>Die Vorschau nutzt Beispieldaten. Gesichert werden nur die Texte.</Body>
      <ConfirmSheet confirm={confirm} onClose={() => setConfirm(null)} />
    </Screen>
  );
}
