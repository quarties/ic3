// Make the release packages: web-ext-artifacts/ic3-<browser>-<version>.zip
// Run `bun run build` first (`bun run package` does both).
import { join } from 'node:path';
import pkg from '../package.json';
import { TARGETS } from './manifest';

const ROOT = join(import.meta.dir, '..');

for (const target of TARGETS) {
  const filename = `ic3-${target}-${pkg.version}.zip`;
  const proc = Bun.spawn(
    [
      'bunx',
      'web-ext',
      'build',
      '--source-dir',
      join(ROOT, 'dist', target),
      '--artifacts-dir',
      join(ROOT, 'web-ext-artifacts'),
      '--filename',
      filename,
      '--overwrite-dest',
    ],
    { stdout: 'ignore', stderr: 'inherit' },
  );
  if ((await proc.exited) !== 0) throw new Error(`web-ext build failed for ${target}`);
  console.log(`web-ext-artifacts/${filename}`);
}
