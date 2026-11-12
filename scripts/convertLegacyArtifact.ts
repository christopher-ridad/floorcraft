/**
 * Converts the original app's shared documents (exported from the Claude artifact database as
 * schedule.json and entries.json) into a team backup to restore in Setup → Backup.
 *
 *   npm run convert:legacy -- <export-folder> <backup.json>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { backupFromLegacy } from '../src/infra/legacy/legacyBackup';

const [folder, output] = process.argv.slice(2);
if (!folder || !output) {
  console.error('Usage: npm run convert:legacy -- <export-folder> <backup.json>');
  process.exit(1);
}

/** Reads a document, unwrapping `{ data: … }` if the export tool wrapped it. */
const read = (name: string): unknown => {
  const document = JSON.parse(readFileSync(join(folder, `${name}.json`), 'utf8')) as unknown;
  return typeof document === 'object' && document !== null && 'data' in document
    ? document.data
    : document;
};

const { backup, unmatched } = backupFromLegacy(
  { schedule: read('schedule'), entries: read('entries') },
  () => crypto.randomUUID(),
);
writeFileSync(output, `${JSON.stringify(backup, null, 2)}\n`);

const [competition] = backup.competitions;
const heats = competition?.schedule.items.filter((item) => item.kind === 'heat').length ?? 0;
console.log(
  `Wrote ${output}: ${heats} heats, ${backup.partnerships.length} partnerships, ` +
    `${Object.values(competition?.entries ?? {}).flat().length} entries.`,
);
console.log('After restoring it, load the official schedule in Setup → Schedule.');
for (const { lead, follow, entry } of unmatched) {
  console.log(`  Not on the schedule, add by hand: ${lead} & ${follow}: ${entry}`);
}
