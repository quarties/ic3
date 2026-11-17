// Print the CHANGELOG.md section of one version (for the GitHub Release notes).
//   bun scripts/changelog.ts 1.0.0
import { join } from 'node:path';

export function changelogSection(changelog: string, version: string): string {
  const lines = changelog.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`## [${version}]`));
  if (start === -1) throw new Error(`No section "## [${version}]" in CHANGELOG.md`);
  const end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  return lines
    .slice(start + 1, end === -1 ? undefined : end)
    .join('\n')
    .trim();
}

if (import.meta.main) {
  const version = process.argv[2]?.replace(/^v/, '');
  if (!version) throw new Error('Usage: bun scripts/changelog.ts <version>');
  const text = await Bun.file(join(import.meta.dir, '..', 'CHANGELOG.md')).text();
  console.log(changelogSection(text, version));
}
