import { expect, test } from 'bun:test';
import { fixture } from '../test-helpers';
import { CARD_SELECTOR, cardTimes, classCells } from './card';

const CARD_HTML = await fixture('card.html');

const load = () => {
  document.body.innerHTML = CARD_HTML;
  return document.querySelector<HTMLElement>(CARD_SELECTOR)!;
};

test('the selector finds the card despite the hash in the class name', () => {
  expect(load()).not.toBeNull();
});

test('cardTimes: departure and arrival, the price is not a time', () => {
  expect(cardTimes(load())).toEqual({ dep: '20:01', arr: '22:50' });
});

test('cardTimes: null when the card has no times', () => {
  document.body.innerHTML = '<li><span>x</span></li>';
  expect(cardTimes(document.querySelector('li')!)).toBeNull();
});

test('classCells: the <li> of each class, not the card', () => {
  const card = load();
  const cells = classCells(card);
  expect(cells[1]?.textContent).toContain('85,00');
  expect(cells[2]?.textContent).toContain('64,00');
  expect(cells[1]).not.toBe(card);
});

test('classCells: English page ("Class 1")', () => {
  document.body.innerHTML = CARD_HTML.replace('Klasa 1', 'Class 1');
  expect(classCells(document.querySelector<HTMLElement>(CARD_SELECTOR)!)[1]).toBeDefined();
});
