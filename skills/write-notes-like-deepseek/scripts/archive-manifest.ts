/** Shared validation for frozen notes and their append-only manifest. */
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { AGENT_NOTE_CLASSES } from "./agent-note-tree.ts";

export interface Manifest { version: 1; files: Record<string, string>; }

export function isNoteFilename(name: string): boolean {
  return /^\d{4}-\d{2}-\d{2}-.+\.md$/.test(name) && !/[\\/\0\r\n]/.test(name) && !name.endsWith(".zh.md");
}

function isArchiveKey(key: string): boolean {
  const parts = key.split("/");
  return parts.length === 3 && parts[0] === "archived"
    && (AGENT_NOTE_CLASSES as readonly string[]).includes(parts[1]) && isNoteFilename(parts[2]);
}

export function parseManifest(raw: string, label: string): Manifest {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error(`${label} is not valid JSON`); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${label} must be a manifest object`);
  const value = parsed as Record<string, unknown>;
  if (value.version !== 1 || !value.files || typeof value.files !== "object" || Array.isArray(value.files)
    || Object.keys(value).some((key) => key !== "version" && key !== "files")) {
    throw new Error(`${label} must contain only version: 1 and a files object`);
  }
  for (const [key, seal] of Object.entries(value.files)) {
    if (!isArchiveKey(key)) throw new Error(`${label} has an invalid archived note path: ${key}`);
    if (typeof seal !== "string" || !/^sha256:[a-f0-9]{64}$/.test(seal)) throw new Error(`${label} has an invalid SHA-256 seal for ${key}`);
  }
  return { version: 1, files: { ...value.files } as Record<string, string> };
}

/** Reject path escapes and symlinks within the selected note tree, including dangling links. */
export function assertPlainNotePath(root: string, path: string): void {
  const rel = relative(root, path);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`path is outside the selected note root: ${path}`);
  const components = rel ? rel.split(sep) : [];
  let cursor = root;
  for (let i = 0; i <= components.length; i++) {
    try {
      const info = lstatSync(cursor);
      if (info.isSymbolicLink()) throw new Error(`symbolic links are not supported in the note tree: ${cursor}`);
      if (i < components.length && !info.isDirectory()) throw new Error(`expected a directory: ${cursor}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    if (i < components.length) cursor = join(cursor, components[i]);
  }
}

export const sealOf = (content: string | Buffer): string => `sha256:${createHash("sha256").update(content).digest("hex")}`;
export const manifestText = (manifest: Manifest): string => JSON.stringify({
  version: 1,
  files: Object.fromEntries(Object.entries(manifest.files).sort(([a], [b]) => a.localeCompare(b))),
}, null, 2) + "\n";

/** Write through a sibling temporary file so a failed write cannot truncate the original. */
export function replaceFileAtomically(path: string, content: string | Buffer, mode?: number): void {
  const temporary = join(dirname(path), `.agent-note-${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, content, { flag: "wx", mode });
    renameSync(temporary, path);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, LC_ALL: "C" } }).trimEnd();
}

/** Resolve the repository from an existing ancestor even when the entire notes tree was deleted. */
function gitContext(root: string): { repo: string; canonicalRoot: string } | null {
  let ancestor = root;
  while (!existsSync(ancestor)) {
    const parent = dirname(ancestor);
    if (parent === ancestor) break;
    ancestor = parent;
  }
  if (!lstatSync(ancestor).isDirectory()) throw new Error(`note root ancestor is not a directory: ${ancestor}`);
  const canonicalRoot = resolve(realpathSync(ancestor), relative(ancestor, root));
  try { return { repo: git(ancestor, ["rev-parse", "--show-toplevel"]), canonicalRoot }; }
  catch (error) {
    const failure = error as NodeJS.ErrnoException & { stderr?: Buffer | string };
    if (failure.code === "ENOENT" || String(failure.stderr).includes("not a git repository")) return null;
    throw new Error("could not inspect the note root's Git repository", { cause: error });
  }
}

function compareBaseline(root: string, manifest: Manifest): string[] {
  const explicitRef = process.env.AGENT_NOTE_ARCHIVE_BASE_REF;
  const baseRef = explicitRef ?? "HEAD";
  if (!baseRef.trim()) throw new Error("AGENT_NOTE_ARCHIVE_BASE_REF must name a valid commit");
  const context = gitContext(root);
  if (!context) {
    if (explicitRef !== undefined) throw new Error(`cannot verify explicit Git baseline ${baseRef}: the note root is not in an available Git repository`);
    return ["note root is not in an available Git repository — append-only history check skipped; local seal hashes were still checked"];
  }
  const { repo, canonicalRoot } = context;
  const manifestRel = relative(repo, join(canonicalRoot, "archived", "manifest.json")).split(sep).join("/");
  if (manifestRel.startsWith("../") || isAbsolute(manifestRel)) throw new Error("note root is outside the discovered Git repository");
  let commit: string;
  try { commit = git(repo, ["rev-parse", "--verify", "--end-of-options", `${baseRef}^{commit}`]); }
  catch (error) {
    // A genuinely empty repository has no default HEAD yet. An explicit ref
    // (including an all-zero CI before SHA) is never treated as initialization.
    if (explicitRef === undefined) {
      try {
        git(repo, ["symbolic-ref", "-q", "HEAD"]);
        if (git(repo, ["rev-list", "--all", "--max-count=1"]) === "") return ["Git repository has no commits yet — initializing archive history"];
      } catch { /* The repository is not a valid empty repository. */ }
    }
    throw new Error(`Git baseline ${baseRef} is invalid or unavailable; fetch or select an existing commit`, { cause: error });
  }
  // Resolve the commit first, then distinguish a missing path from every other
  // Git failure. A bad ref must never look like an absent historical manifest.
  const entry = git(repo, ["--literal-pathspecs", "ls-tree", "-z", commit, "--", manifestRel]);
  if (!entry) return [];
  const rows = entry.split("\0").filter(Boolean);
  if (rows.length !== 1 || rows[0].slice(rows[0].indexOf("\t") + 1) !== manifestRel
    || !/^100[0-7]{3} blob [a-f0-9]+\t/.test(rows[0])) throw new Error(`manifest at Git baseline ${baseRef} must be a regular file`);
  const baseline = parseManifest(git(repo, ["show", `${commit}:${manifestRel}`]), `archived/manifest.json at ${baseRef}`);
  for (const [key, seal] of Object.entries(baseline.files)) {
    if (manifest.files[key] !== seal) throw new Error(`${key} — seal changed or removed relative to ${baseRef}; archived seals are append-only`);
  }
  return [];
}

export function inspectArchive(root: string, allowUnsealed = false): {
  manifest: Manifest; manifestPath: string; originalManifest: Buffer | undefined; files: string[]; warnings: string[];
} {
  const archivedDir = join(root, "archived");
  const manifestPath = join(archivedDir, "manifest.json");
  assertPlainNotePath(root, manifestPath);
  let originalManifest: Buffer | undefined;
  let manifest: Manifest = { version: 1, files: {} };
  if (existsSync(manifestPath)) {
    if (!lstatSync(manifestPath).isFile()) throw new Error("archived/manifest.json must be a regular file");
    originalManifest = readFileSync(manifestPath);
    manifest = parseManifest(originalManifest.toString("utf8"), "archived/manifest.json");
  }
  const files: string[] = [];
  function scan(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const path = join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`symbolic links are not supported in the archive: ${path}`);
      if (entry.isDirectory()) scan(path);
      else if (entry.isFile() && entry.name.endsWith(".md") && !entry.name.endsWith(".zh.md")) {
        const key = relative(root, path).split(sep).join("/");
        if (key === "archived/AGENTS.md" || key === "archived/CLAUDE.md") continue;
        if (!isArchiveKey(key)) throw new Error(`${key} — expected archived/<class>/yyyy-mm-dd-topic.md`);
        const raw = readFileSync(path);
        const lines = raw.toString("utf8").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
        if (!/^# Agent Note[:：] ?\S/.test(lines[0] ?? "") || lines[1] !== "" || lines[2] !== "Status: implemented"
          || !/^Archived: \d{4}-\d{2}-\d{2}$/.test(lines[3] ?? "") || lines[4] !== "") {
          throw new Error(`${key} — expected title, blank line, Status: implemented, Archived: YYYY-MM-DD, blank line`);
        }
        const actual = sealOf(raw);
        if (manifest.files[key] === undefined) {
          if (!allowUnsealed) throw new Error(`${key} — missing seal in archived/manifest.json (run the verifier with --write)`);
          manifest.files[key] = actual;
        } else if (manifest.files[key] !== actual) throw new Error(`${key} — seal mismatch: archived notes are frozen`);
        files.push(key);
      }
    }
  }
  if (existsSync(archivedDir)) scan(archivedDir);
  const found = new Set(files);
  for (const key of Object.keys(manifest.files)) if (!found.has(key)) throw new Error(`${key} — sealed entry has no archived note on disk`);
  const warnings = compareBaseline(root, manifest);
  return { manifest, manifestPath, originalManifest, files, warnings };
}
