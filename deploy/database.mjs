import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync, existsSync, chmodSync, chownSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const [operation, argument] = process.argv.slice(2);
const current = process.env.INFLUENCERS_DB_PATH || '/app/data/influencers.sqlite';
function verify(db) {
  if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('Database integrity check failed');
  if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Database foreign key check failed');
  return Number(db.prepare('SELECT count(*) AS count FROM influencers').get().count);
}
if (!argument || !['backup','restore'].includes(operation)) throw new Error('Usage: database.mjs backup DESTINATION | restore SOURCE');
const source = operation === 'backup' ? current : resolve(argument);
const destination = operation === 'backup' ? resolve(argument) : current;
if (source === destination || existsSync(destination)) throw new Error('Destination already exists; refusing to overwrite data');
mkdirSync(dirname(destination), {recursive:true,mode:0o700});
const original = new DatabaseSync(source, {readOnly:true});
try {
  const count = verify(original);
  await backup(original, destination);
  chmodSync(destination, 0o600);
  const saved = new DatabaseSync(destination);
  try {
    // A portable snapshot must not leave root-owned WAL/SHM files behind.
    // This only touches the newly created destination, never the live source.
    saved.exec('PRAGMA journal_mode=DELETE');
    if (verify(saved) !== count) throw new Error('Backup record count mismatch');
  } finally {saved.close();}
  if (operation === 'restore' && process.getuid?.() === 0) {
    chownSync(dirname(destination), 1000, 1000);
    chownSync(destination, 1000, 1000);
  }
  console.log(JSON.stringify({operation,records:count,verified:true}));
} finally {original.close();}
