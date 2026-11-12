/** Archive an implemented Agent Note after validating inputs, existing seals and Git history.
 * Usage: node <skill-dir>/scripts/archive-agent-note.ts <note> [--superseded-by <active-note>]
 * The optional successor receives a historical link; the archived body stays frozen.
 */
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { agentNoteRoot, AGENT_NOTE_CLASSES, AGENT_NOTE_LIFECYCLES, walkAgentNoteTree } from "./agent-note-tree.ts";
import { assertPlainNotePath, inspectArchive, isNoteFilename, manifestText, replaceFileAtomically, sealOf } from "./archive-manifest.ts";
import { validateNoteFormat } from "./verify-agent-note-format.ts";

function readActiveNote(path: string, mustBeImplemented = false) {
  assertPlainNotePath(agentNoteRoot, path);
  const rel = relative(agentNoteRoot, path).split(sep).join("/");
  const parts = rel.split("/");
  if (parts.length !== 3 || !(AGENT_NOTE_LIFECYCLES as readonly string[]).includes(parts[0]) || (mustBeImplemented && parts[0] !== "implemented")
    || !(AGENT_NOTE_CLASSES as readonly string[]).includes(parts[1]) || !isNoteFilename(parts[2])) {
    throw new Error(`${mustBeImplemented ? "archive source must be implemented" : "successor must be active"} at <lifecycle>/<class>/yyyy-mm-dd-topic.md within the selected note root (got ${rel})`);
  }
  if (!lstatSync(path).isFile()) throw new Error(`note must be a regular file: ${rel}`);
  const original = readFileSync(path);
  const raw = original.toString("utf8");
  const lines = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  const formatErrors = validateNoteFormat(raw, parts[0]);
  if (formatErrors.length) throw new Error(`${rel} — ${formatErrors.join("; ")}`);
  return { rel, parts, original, raw, lines, mode: lstatSync(path).mode };
}

function main(): void {
  const args = process.argv.slice(2);
  if (!args[0] || args[0].startsWith("--") || !(args.length === 1 || (args.length === 3 && args[1] === "--superseded-by" && !args[2].startsWith("--")))) {
    throw new Error("Usage: archive-agent-note.ts <note> [--superseded-by <active-note>]");
  }
  const targetPath = resolve(process.cwd(), args[0]);
  const source = readActiveNote(targetPath, true);
  const successorPath = args[2] ? resolve(process.cwd(), args[2]) : undefined;
  if (successorPath === targetPath) throw new Error("--superseded-by must name a different active note");
  const successor = successorPath ? readActiveNote(successorPath) : undefined;
  const [, cls, filename] = source.parts;
  const newArchivedRel = `archived/${cls}/${filename}`;
  const archivedPath = join(agentNoteRoot, newArchivedRel);
  assertPlainNotePath(agentNoteRoot, archivedPath);
  if (existsSync(archivedPath)) throw new Error(`archived target already exists: ${newArchivedRel}`);

  // Every semantic check and read happens before any file is changed. Invalid
  // manifests are errors; the CLI never repairs or replaces existing seals.
  const { manifest, manifestPath, originalManifest, warnings } = inspectArchive(agentNoteRoot);
  const manifestMode = originalManifest ? lstatSync(manifestPath).mode : undefined;
  const { notes, errors } = walkAgentNoteTree();
  if (errors.length) throw new Error(errors.join("\n"));
  const inboundFound: string[] = [];
  for (const note of notes) {
    const path = resolve(agentNoteRoot, note.rel);
    if (path === targetPath) continue;
    assertPlainNotePath(agentNoteRoot, path);
    const content = readFileSync(path, "utf8");
    for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const target = match[1].trim().split("#")[0];
      if (!target || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target)) continue;
      if (resolve(dirname(path), target) === targetPath) { inboundFound.push(note.rel); break; }
    }
  }

  const now = new Date();
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const today = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const newline = source.raw.includes("\r\n") ? "\r\n" : "\n";
  source.lines[2] = "Status: implemented";
  source.lines.splice(3, 0, `Archived: ${today}`);
  const archivedContent = (source.raw.startsWith("\uFEFF") ? "\uFEFF" : "") + source.lines.join(newline);
  manifest.files[newArchivedRel] = sealOf(archivedContent);

  let successorContent: string | undefined;
  if (successor && successorPath) {
    const link = relative(dirname(successorPath), archivedPath).split(sep).join("/");
    if (!successor.raw.includes(`](${link})`)) {
      const title = source.lines[0].replace(/^# Agent Note[:：] ?/, "").replace(/[\[\]\\]/g, "\\$&");
      const eol = successor.raw.includes("\r\n") ? "\r\n" : "\n";
      successorContent = `${successor.raw.replace(/\s*$/, "")}${eol}${eol}[历史快照：${title}](${link})${eol}`;
    }
  }

  // Single-writer operation. Replace manifest/successor through sibling temp
  // files, remove the source last, and roll back completed writes on I/O errors.
  const createdDirs: string[] = [];
  const undo: Array<() => void> = [];
  try {
    for (const dir of [join(agentNoteRoot, "archived"), dirname(archivedPath)]) {
      if (!existsSync(dir)) { mkdirSync(dir); createdDirs.push(dir); }
    }
    const fd = openSync(archivedPath, "wx", source.mode);
    undo.push(() => unlinkSync(archivedPath));
    try { writeFileSync(fd, archivedContent, "utf8"); } finally { closeSync(fd); }
    replaceFileAtomically(manifestPath, manifestText(manifest), manifestMode);
    undo.push(() => {
      if (originalManifest) replaceFileAtomically(manifestPath, originalManifest, manifestMode);
      else unlinkSync(manifestPath);
    });
    if (successorContent !== undefined && successor && successorPath) {
      replaceFileAtomically(successorPath, successorContent, successor.mode);
      undo.push(() => replaceFileAtomically(successorPath, successor.original, successor.mode));
    }
    unlinkSync(targetPath);
  } catch (error) {
    const rollbackErrors: string[] = [];
    for (const restore of undo.reverse()) {
      try { restore(); } catch (rollbackError) { rollbackErrors.push((rollbackError as Error).message); }
    }
    for (const dir of createdDirs.reverse()) {
      try { rmdirSync(dir); } catch (rollbackError) { rollbackErrors.push((rollbackError as Error).message); }
    }
    if (rollbackErrors.length) throw new Error(`${(error as Error).message}; rollback could not fully finish: ${rollbackErrors.join("; ")}`);
    throw error;
  }

  for (const warning of warnings) console.warn(`warning: ${warning}`);
  console.log(`Moved: ${source.rel} -> ${newArchivedRel}`);
  console.log("Sealed in archived/manifest.json");
  if (successorContent !== undefined) console.log(`Linked historical snapshot from ${successor!.rel}`);
  if (inboundFound.length) {
    console.log("Active notes still linking to the former path (review these links):");
    for (const rel of inboundFound) console.log(`  - ${rel}`);
  }
}

try { main(); }
catch (error) {
  console.error(`Error: ${(error as Error).message}`);
  process.exitCode = 1;
}
