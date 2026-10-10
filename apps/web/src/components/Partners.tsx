// Fokus-Partner im Fokus-Modus: wer arbeitet mit, Einladen, Raum verlassen.
import { clock } from '@fokus/core';
import {
  Body,
  Button,
  Notice,
  Sheet,
  accents,
  avatarAccent,
  font,
  onAccent,
  type,
  usePalette,
} from '@fokus/ui';
import { useState } from 'react';
import { Pressable, Share, Text, View } from 'react-native';
import { initials } from '../lib/format';
import type { RoomSnap } from '../lib/room';
import { CopyBox } from './DevExtras';

const since = (iso: string, now: number) => {
  const m = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  return m < 1 ? 'gerade eben' : `seit ${m} Min`;
};

export function PartnerLine({ room, now }: { room: RoomSnap; now: number }) {
  const p = usePalette();
  const others = room.members.filter((m) => !m.me);
  if (!others.length) return null;
  const first = others[0]!;
  const text =
    others.length === 1
      ? `${first.name} ${first.state === 'pause' ? 'macht Pause' : 'arbeitet mit dir'} · ${since(first.joinedAt, now)}`
      : `${others.map((o) => o.name).join(', ')} arbeiten mit dir`;
  return (
    <View style={{ marginTop: 14, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
      <View style={{ flexDirection: 'row' }}>
        {others.slice(0, 3).map((m, i) => (
          <View
            key={m.name + i}
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              marginLeft: i ? -8 : 0,
              backgroundColor: accents[avatarAccent(m.name)].from,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: onAccent, fontSize: 11, fontFamily: font.semibold }}>
              {initials(m.name)}
            </Text>
          </View>
        ))}
      </View>
      <Text style={[type.small, { color: p.ink2, fontSize: 13, flexShrink: 1 }]}>{text}</Text>
    </View>
  );
}

/** „Partner einladen“: Link teilen oder kopieren. */
export function InviteSheet({
  open,
  url,
  onClose,
  error,
}: {
  open: boolean;
  url: string | null;
  onClose: () => void;
  error?: string;
}) {
  const [shared, setShared] = useState(false);
  return (
    <Sheet open={open} onClose={onClose} title="Partner einladen">
      <Body muted>
        Wer den Link öffnet und sich anmeldet, arbeitet live mit dir. Ihr seht nur Namen und ob
        jemand fokussiert oder Pause macht. Der Link gilt für diesen Block (höchstens 3 Stunden).
      </Body>
      {error ? <Notice tone="negative">{error}</Notice> : null}
      {url ? (
        <>
          <CopyBox label="Einladungslink" value={url} />
          <Button
            label={shared ? 'Geteilt' : 'Link teilen'}
            onPress={() => {
              void Share.share({ message: `Fokus mit mir? ${url}`, url })
                .then(() => setShared(true))
                .catch(() => undefined);
            }}
          />
        </>
      ) : null}
    </Sheet>
  );
}

export function LeaveRow({ room, onLeave }: { room: RoomSnap; onLeave: () => void }) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onLeave}
      style={{ marginTop: 6, minHeight: 36, justifyContent: 'center' }}
    >
      <Text style={[type.small, { color: p.ink3 }]}>
        {room.isOwner ? 'Raum für alle beenden' : 'Raum verlassen'} · gestartet{' '}
        {clock(room.startedAt)} Uhr
      </Text>
    </Pressable>
  );
}
