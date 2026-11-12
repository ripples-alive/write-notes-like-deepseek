/** Verify frozen archive headers, local SHA-256 seals and append-only Git history.
 * Usage: node <skill-dir>/scripts/verify-archived-agent-notes.ts [--write]
 * --write adds missing seals only after every check passes.
 * AGENT_NOTE_ARCHIVE_BASE_REF defaults to HEAD; an unavailable explicit ref fails.
 */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { agentNoteRoot } from "./agent-note-tree.ts";
import { inspectArchive, manifestText, replaceFileAtomically } from "./archive-manifest.ts";

try {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--write")) throw new Error("Usage: verify-archived-agent-notes.ts [--write]");
  const isWrite = args[0] === "--write";
  const { manifest, manifestPath, files, warnings } = inspectArchive(agentNoteRoot, isWrite);
  if (isWrite) {
    mkdirSync(dirname(manifestPath), { recursive: true });
    replaceFileAtomically(manifestPath, manifestText(manifest));
  }
  for (const warning of warnings) console.warn(`warning: ${warning}`);
  console.log(`ok: ${files.length} archived note(s) verified, ${Object.keys(manifest.files).length} seal(s) in manifest`);
} catch (error) {
  console.error(`archived: ${(error as Error).message}`);
  process.exitCode = 1;
}
