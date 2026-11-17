import type { ConnectionResult, SeatClass } from '../types';
import { badgeText, tooltipText } from './format';
import type { Tooltip } from './tooltip';

/** The seat badge under the price in one class cell. Create it on first use. */
export function badgeFor(cell: HTMLElement, tooltip?: Tooltip): HTMLElement {
  let badge = cell.querySelector<HTMLElement>(':scope > .ic3');
  if (!badge) {
    badge = cell.ownerDocument.createElement('div');
    badge.className = 'ic3';
    tooltip?.attach(badge);
    cell.appendChild(badge);
  }
  // Align the cells to the top, so a taller badge does not move the class label.
  cell.classList.add('ic3-cell');
  cell.parentElement?.classList.add('ic3-row');
  return badge;
}

/**
 * Remove the badge, and the alignment classes that badgeFor added.
 * A badge under the mouse gets no mouseleave, so hide its tooltip here.
 */
export function removeBadge(badge: HTMLElement, tooltip?: Tooltip): void {
  tooltip?.release(badge);
  const cell = badge.parentElement;
  badge.remove();
  cell?.classList.remove('ic3-cell');
  cell?.parentElement?.classList.remove('ic3-row');
}

type Line = [className: string, text: string];

function setState(badge: HTMLElement, state: string, tip: string, lines: Line[]) {
  badge.dataset.state = state;
  badge.dataset.tip = tip;
  badge.replaceChildren(
    ...lines.map(([className, text]) => {
      const div = badge.ownerDocument.createElement('div');
      div.className = className;
      div.textContent = text;
      return div;
    }),
  );
}

/** Tooltip of a loading badge while the requests wait for the limit. */
export const LIMIT_WAIT_TIP = 'IC3 czeka na limit zapytań. Liczenie zacznie się samo.';

/** `waiting`: the requests wait for the limit now. */
export const showLoading = (badge: HTMLElement, waiting = false) =>
  setState(badge, 'loading', waiting ? LIMIT_WAIT_TIP : '', [['ic3-main', 'liczę miejsca…']]);

/** HTTP 404 for the train: IC has no seat map for it (e.g. a train without seat reservation). */
export const showNoSeatMap = (badge: HTMLElement) =>
  setState(badge, 'nomap', 'PKP Intercity nie udostępnia mapy miejsc dla tego pociągu. Może to być pociąg bez rezerwacji miejsc.', [
    ['ic3-main', 'brak mapy miejsc'],
  ]);

export function showResult(badge: HTMLElement, result: ConnectionResult, cls: SeatClass) {
  const { state, main, sub } = badgeText(result, cls);
  const lines: Line[] = [['ic3-main', main]];
  if (sub) lines.push(['ic3-sub', sub]);
  setState(badge, state, tooltipText(result, cls), lines);
}
