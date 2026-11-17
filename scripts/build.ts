// Build the extension for each browser into dist/<browser>/.
//
//   bun scripts/build.ts            build dist/chrome and dist/firefox
//   bun scripts/build.ts firefox    build one browser
//   bun scripts/build.ts --watch    build again after each change in src/ or static/
import { cp, mkdir, rm } from 'node:fs/promises';
import { watch } from 'node:fs';
import { join } from 'node:path';
import pkg from '../package.json';
import baseManifest from '../static/manifest.json';
import { buildManifest, TARGETS, type Target } from './manifest';

const ROOT = join(import.meta.dir, '..');
const args = process.argv.slice(2);
const targets = TARGETS.filter((t) => args.includes(t));
const selected: readonly Target[] = targets.length ? targets : TARGETS;

async function buildTarget(target: Target): Promise<void> {
  const out = join(ROOT, 'dist', target);
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });

  const result = await Bun.build({
    entrypoints: [join(ROOT, 'src/main.ts')],
    format: 'iife',
    target: 'browser',
    // No minification: reviewers (AMO) and users can read the code in the package.
    minify: false,
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error(`Build failed for ${target}`);
  }
  await Bun.write(join(out, 'content.js'), result.outputs[0]!);
  await cp(join(ROOT, 'static/icons'), join(out, 'icons'), { recursive: true });
  const manifest = buildManifest(baseManifest, pkg.version, target);
  await Bun.write(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

async function buildAll(): Promise<void> {
  const start = performance.now();
  await Promise.all(selected.map(buildTarget));
  const ms = Math.round(performance.now() - start);
  console.log(`Built ${selected.map((t) => `dist/${t}`).join(', ')} (v${pkg.version}) in ${ms} ms`);
}

await buildAll();

if (args.includes('--watch')) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const rebuild = () => {
    clearTimeout(timer);
    timer = setTimeout(() => buildAll().catch((e) => console.error(e.message)), 100);
  };
  for (const dir of ['src', 'static']) watch(join(ROOT, dir), { recursive: true }, rebuild);
  console.log('Watching src/ and static/ ...');
}
