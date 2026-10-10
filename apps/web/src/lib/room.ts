// Fokus-Partner im Client: aktueller Raum, live über SSE (EventSource), Zustand melden.
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { API_BASE, api } from './api';

export type RoomSnap = {
  id: string;
  title: string;
  minutes: number;
  status: 'open' | 'closed';
  ownerName: string;
  isOwner: boolean;
  startedAt: string;
  members: { name: string; state: 'focus' | 'pause'; joinedAt: string; me: boolean }[];
};

/** Mein aktueller Raum (oder null). Aktualisiert sich live, solange der Raum offen ist. */
export function useRoom(active = true) {
  const [room, setRoom] = useState<RoomSnap | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      setRoom(await api<RoomSnap | null>('/api/rooms/current'));
    } catch {
      /* ohne Netz bleibt der letzte Stand */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  // Live: bei jeder Änderung neu laden; zusätzlich alle 30 s (falls die Verbindung abreißt)
  useEffect(() => {
    if (!active || !room || Platform.OS !== 'web' || typeof EventSource === 'undefined') return;
    const es = new EventSource(`${API_BASE}/api/rooms/${room.id}/events`, {
      withCredentials: true,
    });
    es.addEventListener('update', () => void load());
    const t = setInterval(() => void load(), 30_000);
    return () => {
      es.close();
      clearInterval(t);
    };
  }, [active, room?.id, load]);

  const create = useCallback(async (title: string, minutes: number) => {
    const r = await api<RoomSnap & { inviteUrl: string }>('/api/rooms', {
      body: { title, minutes },
    });
    setRoom(r);
    return r.inviteUrl;
  }, []);

  const invite = useCallback(async (id: string) => {
    return (await api<{ inviteUrl: string }>(`/api/rooms/${id}/invite`, { body: {} })).inviteUrl;
  }, []);

  const setState = useCallback(
    async (state: 'focus' | 'pause') => {
      if (!room) return;
      await api(`/api/rooms/${room.id}/state`, { body: { state } }).catch(() => undefined);
    },
    [room],
  );

  const leave = useCallback(async () => {
    if (!room) return;
    await api(room.isOwner ? `/api/rooms/${room.id}` : `/api/rooms/${room.id}/leave`, {
      method: room.isOwner ? 'DELETE' : 'POST',
      body: room.isOwner ? undefined : {},
    }).catch(() => undefined);
    setRoom(null);
  }, [room]);

  return { room, loaded, reload: load, create, invite, setState, leave };
}
