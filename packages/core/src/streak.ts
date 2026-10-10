// Serie: wie viele Tage in Folge hat Fokus-Zeit das Tagesziel erreicht? Heute zählt mit, sobald
// das Ziel erreicht ist; vorher bleibt die Serie bis gestern stehen (der Tag ist noch nicht vorbei).
import { addDays, type Day } from './dates';

const MAX_DAYS = 365;

export function streak(focusByDay: Record<Day, number>, today: Day, goal: number): number {
  const hit = (d: Day) => (focusByDay[d] ?? 0) >= goal && goal > 0;
  let n = 0;
  for (let d = hit(today) ? today : addDays(today, -1); n < MAX_DAYS && hit(d); d = addDays(d, -1))
    n++;
  return n;
}
