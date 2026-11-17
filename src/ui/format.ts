import { bicycleSeats } from '../seats';
import type { ConnectionResult, SeatClass } from '../types';

export type BadgeState = 'ok' | 'special' | 'none';

export interface BadgeText {
  state: BadgeState;
  main: string;
  sub: string;
}

/**
 * A number with a Polish adjective about seats ("miejsca"):
 * 1, 2-4, 22-24, … take the nominative ("2 wolne"), the other numbers the genitive ("5 wolnych").
 * 12-14 take the genitive ("12 wolnych").
 */
export function seats(n: number, nominative: string, genitive: string): string {
  const last = n % 10;
  const lastTwo = n % 100;
  const useNominative = n === 1 || (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14));
  return `${n} ${useNominative ? nominative : genitive}`;
}

const free = (n: number) => seats(n, 'wolne', 'wolnych');
const special = (n: number) => seats(n, 'specjalne', 'specjalnych');
const normal = (n: number) => seats(n, 'zwykłe', 'zwykłych');

/** Texts for one class cell. Pure function, no DOM. */
export function badgeText(result: ConnectionResult, cls: SeatClass): BadgeText {
  const c = result.total[cls];
  // For a connection with changes, the bicycle seats of one leg do not help on the other legs.
  const bikes = result.legs.length === 1 ? bicycleSeats(c) : 0;
  const bikeNote = `🚲 ${bikes}`;

  if (c.free > 0) {
    const sub = c.special > 0 ? `+${special(c.special)}` + (bikes ? ` (${bikeNote})` : '') : '';
    return { state: 'ok', main: free(c.free), sub };
  }
  if (c.special > 0) {
    return { state: 'special', main: `tylko specjalne: ${c.special}`, sub: bikes ? `w tym ${bikeNote}` : '' };
  }
  return { state: 'none', main: 'brak miejsc', sub: '' };
}

const defaultTime = (t: number) => new Date(t).toLocaleTimeString('pl-PL');

/**
 * Tooltip text: special seat types (for each leg of a connection with changes)
 * and the time of the oldest data.
 */
export function tooltipText(result: ConnectionResult, cls: SeatClass, formatTime = defaultTime): string {
  const multi = result.legs.length > 1;
  const lines: string[] = [];
  result.legs.forEach((leg, i) => {
    const c = leg[cls];
    if (multi) lines.push(`Odcinek ${i + 1}: ${normal(c.free)}, ${special(c.special)}`);
    for (const [type, n] of Object.entries(c.types).sort((a, b) => b[1] - a[1])) {
      lines.push(`${multi ? '   ' : ''}${type}: ${n}`);
    }
  });
  if (lines.length) lines.push('');
  lines.push(`Dane z ${formatTime(Math.min(...result.legs.map((l) => l.time)))}`);
  return lines.join('\n');
}
