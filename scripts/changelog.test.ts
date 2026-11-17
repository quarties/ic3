import { expect, test } from 'bun:test';
import { changelogSection } from './changelog';

const CHANGELOG = `# Changelog

## [Unreleased]

- next

## [0.2.0] - 2026-12-01

### Dodane

- B

## [0.1.0] - 2026-11-13

- A
`;

test('returns the section of one version, without its heading', () => {
  expect(changelogSection(CHANGELOG, '0.2.0')).toBe('### Dodane\n\n- B');
});

test('the last section ends at the end of the file', () => {
  expect(changelogSection(CHANGELOG, '0.1.0')).toBe('- A');
});

test('a version without a section: error', () => {
  expect(() => changelogSection(CHANGELOG, '9.9.9')).toThrow('No section');
});
