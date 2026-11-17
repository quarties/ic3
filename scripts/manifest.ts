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
        // `data_collection_permissions` needs Firefox 140 (`world: "MAIN"` needs 128).
        strict_min_version: '140.0',
        data_collection_permissions: { required: ['none'] },
      },
      // `data_collection_permissions` needs Firefox for Android 142.
      gecko_android: { strict_min_version: '142.0' },
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
