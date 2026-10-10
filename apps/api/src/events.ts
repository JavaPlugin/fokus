// Fachliche Ereignisse innerhalb eines API-Prozesses (für Webhooks). Routen melden nur, was
// passiert ist; wer zuhört, entscheidet selbst. Gemeldet wird erst nach erfolgreichem Speichern.
import { EventEmitter } from 'node:events';

export type FkEvent = 'focus.started' | 'focus.ended' | 'ping';
export const EVENTS: FkEvent[] = ['focus.started', 'focus.ended'];

const bus = new EventEmitter();
bus.setMaxListeners(50);

export function emitEvent(userId: string, event: FkEvent, data: Record<string, unknown>) {
  bus.emit('event', userId, event, data);
}

export function onEvent(
  fn: (userId: string, event: FkEvent, data: Record<string, unknown>) => void,
) {
  bus.on('event', fn);
  return () => void bus.off('event', fn);
}
