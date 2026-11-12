/**
 * Enforce Agent Note headers, lifecycle-specific sections, alternatives.
 * Implemented notes may not carry proposal-era H2s; present tense in the
 * body is a prose rule, not a lexical scan.
 * Run: node <skill-dir>/scripts/verify-agent-note-format.ts
 */
import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { agentNoteRoot, walkAgentNoteTree } from "./agent-note-tree.ts";

const STATUS: Record<string, RegExp> = {
  proposed: /^Status: proposed$|^状态[:：] ?(?:proposed|已提议)$/,
  implemented: /^Status: implemented$|^状态[:：] ?(?:implemented|已实现)$/,
  rejected: /^Status: rejected — .+$|^状态[:：] ?(?:rejected|已否决) — .+$/,
};

const PROBLEM_FIRST = ["## Problem", "## 问题"];

const REQUIRED: Record<string, string[][]> = {
  proposed: [
    ["## Proposal", "## 提议", "## 方案", "## 提案"],
    ["## Acceptance criteria", "## 验收标准", "## 验收条件", "## 接受标准"],
    ["## Risks", "## 风险"],
  ],
  implemented: [
    ["## Decision", "## 决定", "## 决策"],
    ["## Consequences", "## 后果", "## 影响", "## 结果", "## 结果与代价", "## 影响与验证", "## 后果与边界"],
  ],
  rejected: [
    ["## Proposal", "## 提议", "## 方案", "## 提案"],
  ],
};

const BANNED_IMPLEMENTED = new Set([
  "## proposal", "## plan", "## migration plan", "## acceptance criteria",
  "## 提议", "## 方案", "## 提案",
  "## 计划", "## 规划", "## 迁移计划",
  "## 验收标准", "## 验收条件", "## 接受标准",
]);

const ALTERNATIVES_RE = /^## (?:Alternatives considered|.{0,8}?(?:替代方案|备选(?:方案)?|其他做法))$/;

/** Strip trailing parenthetical: `## Decision（说明）` → `## Decision`. */
function headingBase(h: string): string {
  return h.replace(/[（(].*$/, "").trimEnd();
}

interface MaskedSource {
  lines: string[];
  /** line indexes inside fenced code blocks */
  fenced: boolean[];
  /** line indexes inside HTML comments */
  commented: boolean[];
}

/** Normalize BOM/CRLF, then mask fenced code and HTML comment regions. */
function maskSource(raw: string): MaskedSource {
  const normalized = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const fenced = new Array<boolean>(lines.length).fill(false);
  const commented = new Array<boolean>(lines.length).fill(false);
  let fence: { character: string; length: number } | undefined;
  let inComment = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    fenced[i] = fence !== undefined;
    commented[i] = inComment;
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(l);
    // A closing fence must use the opening character, be at least as long,
    // and contain no information string. Shorter/different fences are samples.
    if (fence) {
      fenced[i] = true;
      if (marker && marker[1][0] === fence.character && marker[1].length >= fence.length && /^[ \t]*$/.test(marker[2])) fence = undefined;
      continue;
    }
    // Backtick fence information strings cannot themselves contain backticks.
    if (!inComment && marker && (marker[1][0] === "~" || !marker[2].includes("`"))) {
      fence = { character: marker[1][0], length: marker[1].length };
      fenced[i] = true;
      continue;
    }
    // Fence interiors are opaque: a `<!--` in a HTML/JSX sample must not
    // leak the comment mask past the closing fence.
    const openIdx = inComment ? -1 : l.indexOf("<!--");
    const closeIdx = l.indexOf("-->");
    if (inComment) {
      commented[i] = true;
      if (closeIdx !== -1) inComment = false;
    } else if (openIdx !== -1) {
      commented[i] = true;
      if (closeIdx === -1 || closeIdx < openIdx) inComment = true;
    }
  }
  return { lines, fenced, commented };
}

function isProseLine(src: MaskedSource, i: number): boolean {
  if (src.fenced[i] || src.commented[i]) return false;
  return !/^\s*>/.test(src.lines[i]);
}

/** Used by both the verifier and archive preflight so invalid notes cannot be frozen. */
export function validateNoteFormat(raw: string, lifecycle: string): string[] {
  const errors: string[] = [];
  const fail = (msg: string) => { errors.push(msg); };
  const src = maskSource(raw);
  const { lines } = src;
  const proseIdx: number[] = [];
  for (let i = 0; i < lines.length; i++) if (isProseLine(src, i)) proseIdx.push(i);
  const prose = proseIdx.map((i) => lines[i]);

  // Halfwidth or fullwidth colon (IME often inserts ：)
  if (!/^# Agent Note[:：] ?\S/.test(lines[0] ?? "")) fail("line 1 must be `# Agent Note: <title>`");
  if (lines[1] !== "") fail("line 2 must be blank");

  const re = STATUS[lifecycle];
  if (re && !re.test(lines[2] ?? "")) fail(`line 3 must match ${lifecycle} status grammar (${String(re)})`);
  if (lines[3] !== "") fail("line 4 must be blank");

  // single Status line (fences, quotes and comments immune). Match strict
  // status-shaped lines only — body prose like "Status: 200 means OK" must
  // not be miscounted as a duplicate status header.
  const looksLikeStatusLine = (l: string) => {
    const t = l.trim();
    return Object.values(STATUS).some((re) => re.test(t));
  };
  const statusCount = prose.filter(looksLikeStatusLine).length;
  if (statusCount !== 1) fail("Status: line must appear exactly once");

  const h2s = prose.filter((l: string) => l.startsWith("## ")).map((l: string) => l.trimEnd());
  const bases = h2s.map(headingBase);
  if (!PROBLEM_FIRST.includes(headingBase(h2s[0] ?? ""))) {
    fail(`first section must be ## Problem or ## 问题 (got ${JSON.stringify(h2s[0] ?? "<none>")})`);
  }

  for (const group of REQUIRED[lifecycle] ?? []) {
    if (!group.some((h: string) => bases.includes(h))) fail(`missing one of ${JSON.stringify(group)}`);
  }

  if (lifecycle === "implemented") {
    for (const h of bases.filter((x: string) => BANNED_IMPLEMENTED.has(x.toLowerCase()))) {
      fail(`banned in implemented: ${h}`);
    }
  }

  const hasSection = bases.some((h: string) => ALTERNATIVES_RE.test(h));
  // The section is required at every date; it may honestly state that no
  // alternatives were considered instead of inventing rejected options.
  if (!hasSection) {
    fail("missing ## Alternatives considered / ## 备选方案");
  }
  return errors;
}

function main(): void {
  const { notes, errors } = walkAgentNoteTree();
  for (const note of notes) {
    const raw = readFileSync(resolve(agentNoteRoot, note.rel), "utf8");
    errors.push(...validateNoteFormat(raw, note.lifecycle).map((error) => `format: ${note.rel} — ${error}`));
  }
  if (errors.length) {
    for (const error of errors) console.error(error);
    process.exitCode = 1;
  } else console.log(`ok: ${notes.length} note(s) verified`);
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) main();
