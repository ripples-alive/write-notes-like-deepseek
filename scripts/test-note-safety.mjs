/** Offline regression fixtures for note validation and fail-safe archiving. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptDir = resolve(dirname(fileURLToPath(import.meta.url)), '../skills/write-notes-like-deepseek/scripts');
const verifyScript = 'verify-archived-agent-notes.ts';
const archiveScript = 'archive-agent-note.ts';
const sourceRel = 'implemented/process/2000-01-01-source.md';
const archiveKey = 'archived/process/2000-01-01-history.md';
const hash = (raw) => `sha256:${createHash('sha256').update(raw).digest('hex')}`;
const body = (lifecycle = 'implemented') => `# Agent Note: Fixture decision\n\nStatus: ${lifecycle === 'rejected' ? 'rejected — fixture decision' : lifecycle}\n\n## Problem\nA generic fixture needs a recorded decision.\n\n${lifecycle === 'implemented' ? '## Decision' : '## Proposal'}\nUse the fixture workflow.\n\n## Alternatives considered\nNone were considered for this narrow fixture.\n\n${lifecycle === 'implemented' ? '## Consequences\nThe fixture is deterministic.' : lifecycle === 'proposed' ? '## Acceptance criteria\nThe fixture succeeds.\n\n## Risks\nNone identified for the fixture.' : ''}\n`;
const archivedBody = () => body().replace('Status: implemented\n', 'Status: implemented\nArchived: 2000-01-02\n');

function put(path, content) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); }
function fixture(t, { git = true, notePath = '.agents/notes' } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'note-safety-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const root = join(cwd, notePath);
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
  for (const key of ['AGENT_NOTE_ROOT', 'AGENT_NOTE_ARCHIVE_BASE_REF', 'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR']) delete env[key];
  if (notePath !== '.agents/notes') env.AGENT_NOTE_ROOT = root;
  const gitRun = (...args) => execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  if (git) gitRun('-c', 'init.defaultBranch=main', 'init', '--quiet');
  return {
    cwd, root, env, git: gitRun,
    write(rel, content = body()) { put(join(root, rel), content); return join(root, rel); },
    commit() {
      gitRun('add', '--all');
      gitRun('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '--quiet', '-m', 'Record fixture baseline');
      return gitRun('rev-parse', 'HEAD');
    },
    run(script, args = [], overrides = {}, nodeArgs = []) {
      return spawnSync(process.execPath, [...nodeArgs, join(scriptDir, script), ...args], { cwd, env: { ...env, ...overrides }, encoding: 'utf8' });
    },
  };
}
function seedArchive(f, commit = true) {
  const raw = archivedBody();
  f.write(archiveKey, raw);
  f.write('archived/manifest.json', JSON.stringify({ version: 1, files: { [archiveKey]: hash(raw) } }, null, 2) + '\n');
  if (commit) f.commit();
}
function snapshot(root) {
  const files = {};
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === '.git') continue;
      const path = join(dir, entry.name);
      const key = relative(root, path);
      if (entry.isDirectory()) { files[`${key}/`] = ''; walk(path); }
      else if (entry.isSymbolicLink()) files[key] = '<symlink>';
      else files[key] = readFileSync(path).toString('base64');
    }
  }
  walk(root);
  return files;
}
function succeeds(result) { assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error)); }
function fails(result, expected) {
  assert.equal(result.status, 1, result.stderr || result.stdout || String(result.error));
  if (expected) assert.match(result.stderr, expected);
}
function failsUnchanged(f, script, args, pattern, env = {}, nodeArgs = []) {
  const before = snapshot(f.cwd);
  fails(f.run(script, args, env, nodeArgs), pattern);
  assert.deepEqual(snapshot(f.cwd), before, 'a rejected operation must not change files or create directories');
}

test('valid archive verifies against its recorded Git baseline', (t) => {
  const f = fixture(t);
  seedArchive(f);
  succeeds(f.run(verifyScript));
});

test('changed content with a recomputed seal cannot replace a historical seal', (t) => {
  const f = fixture(t);
  seedArchive(f);
  const changed = archivedBody() + '\nA later edit.\n';
  f.write(archiveKey, changed);
  f.write('archived/manifest.json', JSON.stringify({ version: 1, files: { [archiveKey]: hash(changed) } }));
  failsUnchanged(f, verifyScript, ['--write'], /append-only/);
  const source = f.write(sourceRel);
  failsUnchanged(f, archiveScript, [source], /append-only/);
});

test('removing the entire notes tree still checks Git history', async (t) => {
  for (const notePath of ['.agents/notes', 'custom/deeper/notes']) await t.test(notePath, (t) => {
    const f = fixture(t, { notePath });
    seedArchive(f);
    rmSync(join(f.cwd, notePath.split('/')[0]), { recursive: true });
    failsUnchanged(f, verifyScript, [], /append-only/);
    failsUnchanged(f, verifyScript, ['--write'], /append-only/);
  });
});

test('invalid, unavailable, empty and all-zero explicit baselines fail', (t) => {
  const f = fixture(t);
  seedArchive(f);
  for (const ref of ['missing-fixture-ref', 'f'.repeat(40), '0'.repeat(40), '']) {
    failsUnchanged(f, verifyScript, ['--write'], /baseline|AGENT_NOTE_ARCHIVE_BASE_REF/, { AGENT_NOTE_ARCHIVE_BASE_REF: ref });
  }
});

test('a valid baseline commit with no manifest permits first sealing', (t) => {
  const f = fixture(t);
  const commit = f.commit();
  f.write(archiveKey, archivedBody());
  succeeds(f.run(verifyScript, ['--write'], { AGENT_NOTE_ARCHIVE_BASE_REF: commit }));
  succeeds(f.run(verifyScript));
});

test('malformed baseline manifests fail even when the current manifest is valid', async (t) => {
  for (const raw of ['{broken', '{"version":1,"files":[]}']) await t.test(raw, (t) => {
    const f = fixture(t);
    f.write('archived/manifest.json', raw);
    f.commit();
    f.write('archived/manifest.json', '{"version":1,"files":{}}\n');
    failsUnchanged(f, verifyScript, [], /manifest.json at HEAD/);
  });
});

test('empty Git repositories and ordinary non-Git folders support first archiving', async (t) => {
  for (const git of [true, false]) await t.test(git ? 'empty Git' : 'non-Git', (t) => {
    const f = fixture(t, { git });
    const source = f.write(sourceRel);
    succeeds(f.run(archiveScript, [source]));
    assert.equal(existsSync(source), false);
    succeeds(f.run(verifyScript));
  });
});

test('external AGENT_NOTE_ROOT uses its own Git context, not the caller repository', (t) => {
  const caller = fixture(t);
  seedArchive(caller);
  const outside = fixture(t, { git: false, notePath: 'external-notes' });
  seedArchive(outside, false);
  const result = caller.run(verifyScript, [], { AGENT_NOTE_ROOT: outside.root });
  succeeds(result);
  assert.match(result.stderr, /history check skipped/);
  fails(caller.run(verifyScript, [], { AGENT_NOTE_ROOT: outside.root, AGENT_NOTE_ARCHIVE_BASE_REF: 'HEAD' }), /cannot verify explicit Git baseline/);
  const otherRepo = fixture(t, { notePath: 'custom-notes' });
  seedArchive(otherRepo);
  rmSync(otherRepo.root, { recursive: true });
  fails(caller.run(verifyScript, [], { AGENT_NOTE_ROOT: otherRepo.root }), /append-only/);
});

test('archiving adds a seal and links from each active successor lifecycle', async (t) => {
  for (const lifecycle of ['proposed', 'implemented', 'rejected']) await t.test(lifecycle, (t) => {
    const f = fixture(t, { notePath: 'custom-notes' });
    f.commit();
    const source = f.write(sourceRel, '\uFEFF' + body().replaceAll('\n', '\r\n'));
    const successor = f.write(`${lifecycle}/process/2000-01-03-successor.md`, body(lifecycle));
    succeeds(f.run(archiveScript, [source, '--superseded-by', successor]));
    const destination = join(f.root, 'archived/process/2000-01-01-source.md');
    assert.equal(existsSync(source), false);
    const archive = readFileSync(destination);
    const manifest = JSON.parse(readFileSync(join(f.root, 'archived/manifest.json'), 'utf8'));
    assert.equal(manifest.files['archived/process/2000-01-01-source.md'], hash(archive));
    assert.match(archive.toString(), /Status: implemented\r\nArchived: \d{4}-\d{2}-\d{2}\r\n\r\n/);
    assert.match(readFileSync(successor, 'utf8'), /\[历史快照：Fixture decision\]\(\.\.\/\.\.\/archived\/process\/2000-01-01-source.md\)/);
    succeeds(f.run(verifyScript));
  });
});

test('invalid current manifests fail without modifying any file', async (t) => {
  const malformed = [
    '{broken', 'null', '{"version":2,"files":{}}', '{"version":1,"files":[]}',
    JSON.stringify({ version: 1, files: { '../escape.md': `sha256:${'a'.repeat(64)}` } }),
    JSON.stringify({ version: 1, files: { [archiveKey]: 'invalid-seal' } }),
  ];
  for (const raw of malformed) await t.test(raw.slice(0, 60), (t) => {
    const f = fixture(t, { git: false });
    const source = f.write(sourceRel);
    f.write('archived/manifest.json', raw);
    failsUnchanged(f, archiveScript, [source], /manifest.json/);
    failsUnchanged(f, verifyScript, ['--write'], /manifest.json/);
  });
});

test('existing seal mismatches and archive destination collisions block archiving', (t) => {
  const f = fixture(t);
  seedArchive(f);
  const source = f.write(sourceRel);
  f.write(archiveKey, archivedBody() + '\nChanged after sealing.\n');
  failsUnchanged(f, archiveScript, [source], /seal mismatch/);
  f.write(archiveKey, archivedBody());
  const colliding = f.write('implemented/process/2000-01-01-history.md');
  failsUnchanged(f, archiveScript, [colliding], /already exists/);
});

test('source, successor and CLI argument errors leave the tree untouched', (t) => {
  const f = fixture(t, { git: false });
  const source = f.write(sourceRel);
  const proposed = f.write('proposed/process/2000-01-04-proposal.md', body('proposed'));
  const wrongClass = f.write('proposed/unknown/2000-01-04-successor.md', body('proposed'));
  const wrongName = f.write('proposed/process/successor.md', body('proposed'));
  const wrongHeader = f.write('proposed/process/2000-01-05-successor.md', body('implemented'));
  const outside = join(f.cwd, 'outside/2000-01-04-successor.md');
  put(outside, body());
  const link = join(f.root, 'proposed/process/2000-01-06-link.md');
  symlinkSync(outside, link);
  for (const successor of [source, outside, wrongClass, wrongName, wrongHeader, link, dirname(source), join(f.root, 'missing.md')]) {
    failsUnchanged(f, archiveScript, [source, '--superseded-by', successor]);
  }
  failsUnchanged(f, archiveScript, [proposed], /source must be implemented/);
  failsUnchanged(f, archiveScript, [source, '--superseded-by'], /Usage/);
  failsUnchanged(f, archiveScript, [source, '--unexpected'], /Usage/);
});

test('a write failure after sealing rolls back archive, manifest and new directories', async (t) => {
  for (const existing of [false, true]) await t.test(existing ? 'existing archive' : 'first archive', (t) => {
    const f = fixture(t);
    if (existing) seedArchive(f); else f.commit();
    const source = f.write(sourceRel);
    const successor = f.write('proposed/process/2000-01-03-successor.md', body('proposed'));
    const hook = join(f.cwd, 'simulate-write-failure.mjs');
    put(hook, `import fs from 'node:fs';\nimport { syncBuiltinESMExports } from 'node:module';\nconst rename = fs.renameSync;\nfs.renameSync = (from, to) => { if (to === ${JSON.stringify(successor)}) throw new Error('simulated successor write failure'); return rename(from, to); };\nsyncBuiltinESMExports();\n`);
    failsUnchanged(f, archiveScript, [source, '--superseded-by', successor], /simulated successor write failure/, {}, ['--import', hook]);
  });
});

test('incomplete active notes cannot bypass format checks by being archived', (t) => {
  const f = fixture(t, { git: false });
  const source = f.write(sourceRel, body().replace('## Decision', '## Other section'));
  failsUnchanged(f, archiveScript, [source], /missing one of.*Decision/);
  put(source, body().replace('## Alternatives considered', '## Other section'));
  failsUnchanged(f, archiveScript, [source], /missing ## Alternatives considered/);
});

test('fenced examples cannot supply required sections to the verifier or archive preflight', async (t) => {
  const complete = body();
  const sectionStart = complete.indexOf('## Decision');
  const prefix = complete.slice(0, sectionStart);
  const sections = complete.slice(sectionStart);
  const variants = [
    ['tilde fence', ['~~~markdown', '~~~not-a-closing-fence'], '~~~~'],
    ['longer backtick fence', ['````markdown', '```', '~~~~', '````not-a-closing-fence'], '`````'],
  ];
  for (const [name, opening, closing] of variants) await t.test(name, (t) => {
    const f = fixture(t, { git: false });
    const onlyExamples = `${prefix}${opening.join('\n')}\n${sections}${closing}\n`;
    const source = f.write(sourceRel, onlyExamples);
    const missingSections = /Decision[\s\S]*Consequences[\s\S]*Alternatives considered/;
    failsUnchanged(f, 'verify-agent-note-format.ts', [], missingSections);
    failsUnchanged(f, archiveScript, [source], missingSections);
    // A valid closing fence restores normal prose parsing after the example.
    put(source, `${onlyExamples}\n${sections}`);
    succeeds(f.run('verify-agent-note-format.ts'));
  });
});

test('--write cannot seal malformed archived headers', (t) => {
  const f = fixture(t, { git: false });
  f.write(archiveKey, body());
  failsUnchanged(f, verifyScript, ['--write'], /Archived: YYYY-MM-DD/);
});

test('alternatives section is required at every date; zero real alternatives is valid', (t) => {
  const f = fixture(t, { git: false });
  const note = f.write(sourceRel);
  succeeds(f.run('verify-agent-note-format.ts'));
  const withoutSection = body().replace('## Alternatives considered\nNone were considered for this narrow fixture.\n\n', '');
  put(note, withoutSection + '\n<!-- agent-note-format: alternatives-not-recorded (pre-format Agent Note) -->\n');
  fails(f.run('verify-agent-note-format.ts'), /missing ## Alternatives considered/);
});
