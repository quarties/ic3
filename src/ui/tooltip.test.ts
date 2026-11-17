import { expect, test } from 'bun:test';
import { badgeFor, removeBadge } from './badge';
import { createTooltip } from './tooltip';

function setup() {
  document.body.innerHTML = '<div id="a"></div><div id="b"></div>';
  const tooltip = createTooltip(document, window);
  const badge = (id: string) => {
    const b = badgeFor(document.getElementById(id)!, tooltip);
    b.dataset.tip = `tip ${id}`;
    return b;
  };
  const tip = () => document.querySelector<HTMLElement>('.ic3-tip');
  return { tooltip, badge, tip };
}

test('a removed badge under the mouse: the tooltip hides', () => {
  const { tooltip, badge, tip } = setup();
  const a = badge('a');
  a.dispatchEvent(new Event('mouseenter'));
  expect(tip()!.style.display).toBe('block');
  removeBadge(a, tooltip); // no mouseleave comes for a removed element
  expect(tip()!.style.display).toBe('none');
});

test('another badge is removed: the tooltip stays', () => {
  const { tooltip, badge, tip } = setup();
  const a = badge('a');
  const b = badge('b');
  a.dispatchEvent(new Event('mouseenter'));
  removeBadge(b, tooltip);
  expect(tip()!.style.display).toBe('block');
  expect(tip()!.textContent).toBe('tip a');
});
