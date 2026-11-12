import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'notes-skill-install-')));
const offline = process.argv.includes('--offline');
const env = { ...process.env, DISABLE_TELEMETRY: '1' };
delete env.AGENT_NOTE_ROOT;
delete env.AGENT_NOTE_ARCHIVE_BASE_REF;
// A caller's Git context must not make a temporary host look like this repository.
for (const key of Object.keys(env)) {
  if (key.startsWith('GIT_')) delete env[key];
}

function run(cwd, command, args, success = true) {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout: 120_000 });
  if (result.error) throw result.error;
  assert.equal(result.status === 0, success, `${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

try {
  for (const mode of ['symlink', 'copy']) {
    const host = join(scratch, mode);
    mkdirSync(host);
    const canonical = join(host, '.agents/skills/write-notes-like-deepseek');
    const claude = join(host, '.claude/skills/write-notes-like-deepseek');
    if (offline) {
      // Exercise payload boundaries and host paths without pretending to test the installer.
      mkdirSync(dirname(canonical), { recursive: true });
      mkdirSync(dirname(claude), { recursive: true });
      cpSync(join(repo, 'skills/write-notes-like-deepseek'), canonical, { recursive: true });
      if (mode === 'copy') cpSync(canonical, claude, { recursive: true });
      else symlinkSync(canonical, claude, 'dir');
    } else {
      // Deliberately omit --skill: discover the single skill from this local repository.
      const output = run(host, 'npx', ['--yes', 'skills@1.7.1', 'add', repo,
        '--agent', 'codex', 'claude-code', '-y', ...(mode === 'copy' ? ['--copy'] : [])]);
      assert.match(output, /write-notes-like-deepseek/);
    }
    for (const installed of [canonical, claude]) {
      assert.deepEqual(readdirSync(installed).sort(), ['SKILL.md', 'assets', 'references', 'scripts', 'templates']);
      assert.deepEqual(readdirSync(join(installed, 'assets')), ['agent-notes-board.html']);
      assert.ok(existsSync(join(installed, 'templates/verify-notes.yml')));
      assert.equal(readFileSync(join(installed, 'SKILL.md'), 'utf8'),
        readFileSync(join(repo, 'skills/write-notes-like-deepseek/SKILL.md'), 'utf8'));
    }

    const noteDir = join(host, '.agents/notes/implemented/process');
    mkdirSync(noteDir, { recursive: true });
    const note = join(noteDir, '2026-10-07-install-check.md');
    writeFileSync(note, '# Agent Note: Install check\n\nStatus: implemented\n\n## Problem\nValidate installed paths.\n\n## Decision\nRun from the host project.\n\n## Alternatives considered\nRunning from the skill directory targets the wrong notes.\n\n## Consequences\nHost notes are checked.\n');
    const script = (name) => join(canonical, 'scripts', `${name}.ts`);
    for (const name of ['verify-agent-note-tree', 'verify-agent-note-format', 'verify-archived-agent-notes']) {
      run(host, process.execPath, [script(name)]);
    }
    // A broken host note must fail even though the installed skill has no notes.
    writeFileSync(note, readFileSync(note, 'utf8').replace('Status: implemented', 'Status: proposed'));
    run(host, process.execPath, [join(claude, 'scripts/verify-agent-note-format.ts')], false);
    writeFileSync(note, readFileSync(note, 'utf8').replace('Status: proposed', 'Status: implemented'));
    run(host, process.execPath, [script('build-board'), '--init', 'board.html', 'Install check']);
    const board = readFileSync(join(host, 'board.html'), 'utf8');
    assert.match(board, /Install check/);
    // Exercise the live-directory parser itself: rawBody in bundled HTML can
    // otherwise hide a regression that truncates each rendered section.
    const parserStart = board.indexOf('function parseNote(');
    const parserEnd = board.indexOf('\nasync function scanDirectory', parserStart);
    assert.ok(parserStart >= 0 && parserEnd > parserStart);
    const parsed = runInNewContext(`${board.slice(parserStart, parserEnd)}\nparseNote(raw, rel, new Map());`, {
      raw: '# Agent Note: Multiline fixture\n\nStatus: implemented\n\n## Problem\nFirst line.\nSecond line.\n\nSecond paragraph.\n\n## Decision\nKeep every paragraph.\n\n## Alternatives considered\nNone for this fixture.\n\n## Consequences\nFirst consequence.\nFinal limitation.\n',
      rel: 'implemented/testing/2000-01-01-multiline.md',
    });
    assert.equal(parsed.problem, 'First line.\nSecond line.\n\nSecond paragraph.');
    assert.equal(parsed.consequences, 'First consequence.\nFinal limitation.');
    run(host, process.execPath, [script('build-board'), '--bundle', '.agents/notes', 'demo.html', 'Install check']);
    assert.match(readFileSync(join(host, 'demo.html'), 'utf8'), /Host notes are checked/);
    run(host, process.execPath, [script('archive-agent-note'), note]);
    run(host, process.execPath, [script('verify-archived-agent-notes')]);
    assert.ok(existsSync(join(host, '.agents/notes/archived/process/2026-10-07-install-check.md')));
    console.log(`ok: ${offline ? 'offline payload layout' : 'actual CLI installation'} (${mode}), Codex/Claude paths, host validation, boards, archive`);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
