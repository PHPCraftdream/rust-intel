// Held text: passages that stay out of the shipped files until a condition is met.
//
// A hold is docs/held/<name>.json:
//   { "description": "...", "releaseWhen": "...", "edits": [{ "file": "skill/x.md", "shown": "...", "hidden": "..." }] }
// `shown` is the exact text in the tree when the hold is released; `hidden` is what stands there while
// it is held (the same context minus the held passage). The tree is the source of truth: each edit must match exactly once in
// one of its two forms, so a hand edit that drifted is reported instead of overwritten.
//
//   node dev/held.mjs status             # every hold: held / released / inconsistent
//   node dev/held.mjs hold <name>        # replace shown -> hidden, then sync the Codex mirror
//   node dev/held.mjs release <name>     # replace hidden -> shown, then sync the Codex mirror
//
// docs/ is not installed, so the held text never reaches users or the mirror while it is hidden.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const heldDir = path.join(root, 'docs', 'held');

function count(haystack, needle) {
  if (needle === '') return 0;
  return haystack.split(needle).length - 1;
}

function loadHolds() {
  if (!fs.existsSync(heldDir)) return new Map();
  const holds = new Map();
  for (const entry of fs.readdirSync(heldDir).sort()) {
    if (!entry.endsWith('.json')) continue;
    const hold = JSON.parse(fs.readFileSync(path.join(heldDir, entry), 'utf8'));
    if (!Array.isArray(hold.edits) || hold.edits.length === 0) throw new Error(`${entry}: no edits`);
    for (const edit of hold.edits) {
      if (typeof edit.file !== 'string' || typeof edit.shown !== 'string' || typeof edit.hidden !== 'string' || edit.shown === '' || edit.hidden === '' || edit.shown === edit.hidden) {
        throw new Error(`${entry}: each edit needs file and a non-empty, different shown and hidden (put surrounding context into both so the spot stays findable)`);
      }
    }
    holds.set(entry.slice(0, -'.json'.length), hold);
  }
  return holds;
}

// 'shown' | 'hidden' | 'inconsistent' for one edit, judged against the file on disk.
function editState(edit) {
  const text = fs.readFileSync(path.join(root, edit.file), 'utf8');
  const shown = count(text, edit.shown);
  if (shown === 1) return 'shown';
  if (shown > 1) return 'inconsistent';
  if (count(text, edit.hidden) === 1) return 'hidden';
  return 'inconsistent';
}

function holdState(hold) {
  const states = hold.edits.map(editState);
  if (states.every((s) => s === 'shown')) return 'released';
  if (states.every((s) => s === 'hidden')) return 'held';
  return 'inconsistent';
}

function apply(hold, name, from, to) {
  const target = from === 'shown' ? 'hidden' : 'shown';
  const pending = new Map();
  for (const edit of hold.edits) {
    const text = pending.get(edit.file) ?? fs.readFileSync(path.join(root, edit.file), 'utf8');
    if (count(text, edit[from]) !== 1) {
      throw new Error(`${name}: ${edit.file}: expected the ${from} text exactly once, found ${count(text, edit[from])}; nothing was written`);
    }
    pending.set(edit.file, text.replace(edit[from], () => edit[target]));
  }
  for (const [file, text] of pending) fs.writeFileSync(path.join(root, file), text);
  const sync = spawnSync(process.execPath, [path.join(root, 'dev', 'sync-mirror.mjs')], { stdio: 'inherit' });
  if (sync.status !== 0) throw new Error('mirror sync failed');
  console.log(`${name}: ${to}`);
}

const [command, name] = process.argv.slice(2);
const holds = loadHolds();

if (command === 'status') {
  if (holds.size === 0) console.log('no holds');
  let bad = false;
  for (const [holdName, hold] of holds) {
    const state = holdState(hold);
    if (state === 'inconsistent') bad = true;
    console.log(`${holdName}: ${state} — release when: ${hold.releaseWhen ?? '(unspecified)'}`);
  }
  process.exit(bad ? 1 : 0);
} else if (command === 'hold' || command === 'release') {
  const hold = holds.get(name);
  if (!hold) {
    console.error(`unknown hold '${name}'; known: ${[...holds.keys()].join(', ') || '(none)'}`);
    process.exit(2);
  }
  const state = holdState(hold);
  if (state === 'inconsistent') {
    console.error(`${name}: inconsistent — some edits are in neither form; fix by hand first`);
    process.exit(1);
  }
  if (command === 'hold') {
    if (state === 'held') console.log(`${name}: already held`);
    else apply(hold, name, 'shown', 'held');
  } else if (state === 'released') console.log(`${name}: already released`);
  else apply(hold, name, 'hidden', 'released');
} else {
  console.error('usage: node dev/held.mjs status | hold <name> | release <name>');
  process.exit(2);
}
