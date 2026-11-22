// Build the manifest.json of one browser from static/manifest.json.

export type Target = 'chrome' | 'firefox';
export const TARGETS: readonly Target[] = ['chrome', 'firefox'];

type Manifest = Record<string, unknown>;

/** Settings that only one browser reads. The other browser shows a warning for them. */
const BROWSER_KEYS: Record<Target, Manifest> = {
  chrome: {
    // `world: "MAIN"` in content_scripts needs Chrome 111.
    minimum_chrome_version: '111',
  },
  firefox: {
    browser_specific_settings: {
      gecko: {
        id: 'ic3@quarties.github.io',
        // `world: "MAIN"` in content_scripts needs Firefox 128.
        // Firefox 140+ reads `data_collection_permissions`. Firefox 128-139 ignores it,
        // which is correct, because IC3 collects no data.
        strict_min_version: '128.0',
        data_collection_permissions: { required: ['none'] },
      },
      // The same for Firefox for Android: `world: "MAIN"` needs 128, it reads the key from 142.
      gecko_android: { strict_min_version: '128.0' },
    },
  },
};

/**
 * @param base - static/manifest.json, without "version"
 * @param version - from package.json, so the version is in one place only
 */
export function buildManifest(base: Manifest, version: string, target: Target): Manifest {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Bad version "${version}": use MAJOR.MINOR.PATCH`);
  const { version: _ignored, ...rest } = base;
  return { ...rest, version, ...BROWSER_KEYS[target] };
}
