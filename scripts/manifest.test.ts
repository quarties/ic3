import { expect, test } from 'bun:test';
import base from '../static/manifest.json';
import { buildManifest } from './manifest';

test('version comes from the argument', () => {
  expect(buildManifest(base, '1.2.3', 'chrome').version).toBe('1.2.3');
});

test('chrome: no Firefox settings, minimum Chrome version for world MAIN', () => {
  const m = buildManifest(base, '0.1.0', 'chrome');
  expect(m.browser_specific_settings).toBeUndefined();
  expect(m.minimum_chrome_version).toBe('111');
});

test('firefox: add-on ID and minimum Firefox version', () => {
  type Gecko = { id: string; strict_min_version: string; data_collection_permissions: unknown };
  const m = buildManifest(base, '0.1.0', 'firefox') as {
    browser_specific_settings: { gecko: Gecko; gecko_android: { strict_min_version: string } };
  };
  expect(m.browser_specific_settings.gecko.id).toBe('ic3@quarties.github.io');
  // Firefox 128 (ESR) is the first version with world MAIN. Do not raise it for data_collection_permissions.
  expect(m.browser_specific_settings.gecko.strict_min_version).toBe('128.0');
  expect(m.browser_specific_settings.gecko_android.strict_min_version).toBe('128.0');
  expect(m.browser_specific_settings.gecko.data_collection_permissions).toEqual({ required: ['none'] });
  expect(m).not.toHaveProperty('minimum_chrome_version');
});

test('a version that the stores do not accept: error', () => {
  expect(() => buildManifest(base, '1.0.0-beta.1', 'firefox')).toThrow('Bad version');
});
