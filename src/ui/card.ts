import type { SeatClass } from '../types';

/**
 * Read the connection cards of ebilet.intercity.pl. The class names come from CSS modules
 * and end with a hash (e.g. "…__container__nLRQB"), so the selectors match the start only.
 */

export const CARD_SELECTOR = 'li[class*="tripPropositionDesktop__container__"]';
const TIME_SELECTOR = '[class*="label_bigText"] span';
const CLASS_LABEL = /^(Klasa|Class|Клас)\s*([12])$/i;

/** Departure and arrival "HH:MM" of a card, or null. */
export function cardTimes(card: Element): { dep: string; arr: string } | null {
  const times = [...card.querySelectorAll(TIME_SELECTOR)]
    .map((s) => s.textContent?.trim() ?? '')
    .filter((t) => /^\d\d:\d\d$/.test(t));
  return times.length >= 2 ? { dep: times[0]!, arr: times[1]! } : null;
}

/** The <li> cells of class 1 and class 2 (with the price) in a card. */
export function classCells(card: Element): Partial<Record<SeatClass, HTMLElement>> {
  const cells: Partial<Record<SeatClass, HTMLElement>> = {};
  for (const span of card.querySelectorAll('span')) {
    const m = span.textContent?.trim().match(CLASS_LABEL);
    if (!m) continue;
    const cls = Number(m[2]) as SeatClass;
    const li = span.closest('li');
    if (li && li !== card && !cells[cls]) cells[cls] = li;
  }
  return cells;
}
