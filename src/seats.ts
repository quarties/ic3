import type { ClassCount, SeatClass, SeatCounts } from './types';

/**
 * Seat attributes for a group of passengers: disabled, wheelchair, carer, child, bicycle.
 * Other attributes, for example "Strefa Ciszy*" (quiet zone), mean a normal seat.
 */
export const SPECIAL_SEAT = /OzN|wózk|opiekun|dzieck|rower/i;

export const BICYCLE_SEAT = /rower/i;

export const emptyCounts = (): SeatCounts => ({
  1: { free: 0, special: 0, types: {} },
  2: { free: 0, special: 0, types: {} },
});

/** Add the counts of `b` to `a` (in place) and return `a`. */
export function addCounts(a: SeatCounts, b: SeatCounts): SeatCounts {
  for (const cls of [1, 2] as const) {
    a[cls].free += b[cls].free;
    a[cls].special += b[cls].special;
    for (const [type, n] of Object.entries(b[cls].types)) {
      a[cls].types[type] = (a[cls].types[type] ?? 0) + n;
    }
  }
  return a;
}

/**
 * Parse one seat from its aria-label, for example:
 * "Miejsce 93 klasa 1,  środek,  Wolne , niewybrane , Miejsce dla OzN – nie na wózku (4)"
 * `type` is set only for a special seat.
 */
export function parseSeatLabel(label: string): { cls: SeatClass; type: string | null } {
  const cls: SeatClass = /klasa\s*1\b/i.test(label) ? 1 : 2;
  const attr = label.match(/niewybrane\s*,\s*(.+)$/)?.[1];
  if (!attr || !SPECIAL_SEAT.test(attr)) return { cls, type: null };
  return { cls, type: attr.replace(/\s*\(\d+\)\s*$/, '').trim() };
}

/**
 * Count the free seats in the SVG seat map of one wagon.
 * In the SVG, each seat is a <g aria-label="Miejsce …"> with an <image status="…">.
 * status="1" is free, status="3" is taken or not available.
 */
export function countWagonSvg(svgText: string, parser: DOMParser = new DOMParser()): SeatCounts {
  const counts = emptyCounts();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
  for (const seat of doc.querySelectorAll('g[aria-label^="Miejsce"]')) {
    if (!seat.querySelector('[status="1"]')) continue;
    const { cls, type } = parseSeatLabel(seat.getAttribute('aria-label') ?? '');
    if (type) {
      counts[cls].special++;
      counts[cls].types[type] = (counts[cls].types[type] ?? 0) + 1;
    } else {
      counts[cls].free++;
    }
  }
  return counts;
}

/** Number of free bicycle seats in one class. */
export const bicycleSeats = (classCount: ClassCount): number =>
  Object.entries(classCount.types)
    .filter(([type]) => BICYCLE_SEAT.test(type))
    .reduce((sum, [, n]) => sum + n, 0);
