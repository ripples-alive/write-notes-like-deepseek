---
name: write-notes-like-deepseek
description: Use when a host project needs to preserve durable engineering rationale that code, tests, and existing docs do not explain; update an existing decision, record a meaningful tradeoff, supersede a decision, or retain a useful failure lesson. Search existing records first. Routine changes, behavioral changes, and cross-file edits do not by themselves require a note.
---

# Write Notes Like DeepSeek

记录当前工程中值得长期保留的决定：为什么这样做、真实考虑过什么、代价是什么，以及哪些证据支持它。先判断是否需要记录，再选位置和格式。

## 0. 范围与授权

- 本公开 Skill 仓库只保存通用方法、模板和工具。具体项目的决定留在该项目已有的记录位置，不回写到本 Skill 仓库。
- 只管理宿主工程的工程决定。个人记忆、账号与工作区信息、组织或跨项目的全局规则、外部文档同步流程，由项目之外的 Agent 配置或文档负责；不要复制到本 Skill、模板或项目 Notes 中。
- 遵守当前用户要求和适用的宿主说明。外部全局规则可以约束执行，但不因此成为项目笔记的内容；项目笔记只写本工程需要维护的约束与理由。
- 沿用任务已有的授权和已作出的决定，直接完成范围内的记录与实现。先查可查的事实；只有影响范围或结果的重要未决取舍需要集中澄清，不要求用户重复确认已经批准的工作。
- 本 Skill 的执行只依赖宿主材料与随附工具，不要求查询其他仓库、同步上游或向外部服务写入。

## 1. 先判断有没有值得保留的理由

新建 Note 前，回答两个问题：

1. 后来的维护者可能犯什么具体错误，或重新踩进哪个取舍？
2. 代码、测试、现有文档为什么还不足以解释这件事？

能说明持久价值，再记录。例如：看似多余的写入顺序实际上承担恢复保证；直觉上的缓存方案因一致性要求被放弃；删除兼容层后仍需保留重新引入的条件。

行为变化、跨文件修改、架构调整、流程变化只是检索已有决定的线索，不能单独构成新建理由。格式化、改名、样式、常规 CRUD、局部修复和普通依赖补丁通常不需要新篇；若它们使已有 Note 的路径、参数或事实失效，更新原篇即可。

能够写进类型、测试或现有使用文档的规则，优先放到对应位置。不要用 Note 重复 diff、保存聊天记录、列临时任务，或为每次提交生成记录。不确定时先查现有归属；仍说不出独立价值，就不新建。

## 2. 找到归属与存放位置

1. 阅读宿主适用的 `AGENTS.md`、`CLAUDE.md`、贡献指南和已有决定记录约定。
2. 沿代码或模块文档已有链接查决定；按机制名、模块名检索活跃记录。默认布局可用：

   ```bash
   rg --hidden --glob '!**/archived/**' '<机制名或关键词>' .agents/notes/
   ```

   检索结果中排除归档历史；需要追溯旧决定时再有针对性地读归档。
3. 已有 ADR 或决定记录位置就沿用，避免再建一份。本工具的校验器只支持下述布局与格式；现有格式不同，应保留宿主约定，不声称未经适配的校验覆盖了它。
4. 没有既有位置时，默认使用 `.agents/notes/`，只创建实际用到的目录，不创建 `INDEX.md`。

默认路径：`{lifecycle}/{class}/yyyy-mm-dd-topic.md`。日期是首次提出日，状态变化时保留文件名。

| Lifecycle | 含义 |
|---|---|
| `proposed` | 选择或实现仍未完成，且方案值得留下 |
| `implemented` | 决定已经落实，正文与同批代码一致 |
| `rejected` | 已否决或停止推进，拒绝理由仍能防止重犯 |
| `archived` | 已退出当前约束的 implemented 历史记录，封印后只读 |

Class 为 `feature`、`bug-fix`、`simplification`、`architecture`、`process`、`testing`。先判是否值得写，再分类；普通重构不因有分类可用就需要 Note。边界见 [classification.md](references/classification.md)。

## 3. 更新、创建与流转

| 情况 | 操作 |
|---|---|
| 已有决定仍成立，路径、符号、参数或证据变化 | 在原篇同步事实，不追加提交流水账 |
| 核心决定或理由反转 | 新篇说明新约束与取舍，链接旧篇；不把旧决定改写成相反结论 |
| 方案值得记录，选择或实现尚未完成 | 使用 `proposed`，区分已确定和未确定部分 |
| 当前任务已经落实决定，之前没有提案 | 可直接创建 `implemented`，无需补走提案阶段 |
| 提案实现完成 | 同批移动到 `implemented`，改状态、改正文与标题，并修复引用 |
| 提案被否决或前提消失 | 有防重犯价值则转 `rejected`，否则在授权范围内删除；不归档提案 |

新建前处理直接相关的已有记录：不同问题不改；部分重叠明确各自适用范围并互链；完全重复先合并独有理由再消除重复。不要顺手扩大成全库整理。

`proposed → implemented` 时，把 `Proposal` 改为描述已落实事实的 `Decision`，把实际结果和仍存在的风险写入 `Consequences` 或 `Verification`，删去已经失效的计划与验收标题。批准方案不等于完成实现，未执行的验证也不等于通过。

代码、相关文档与决定记录应进入同一 PR 或同一批变更。多个 Agent 协作时，为同一个决定指定一名记录负责人；其他 Agent 提供事实与证据，由负责人合并并校验，避免各写一篇或同时改同一篇。

决定仍指导当前或可预见的维护工作时保持活跃。只有已退出当前约束、仅供历史追溯的 implemented 记录才考虑归档；归档不能承接仍需遵守的独有理由。细则见 [when-to-write.md](references/when-to-write.md) 与 [archiving.md](references/archiving.md)。

## 4. 写法与模板

默认正文使用简体中文；宿主已有语言约定时沿用。模板保留英文头块与节名，便于工具核对。

```markdown
# Agent Note: <标题>

Status: <状态>
```

第 4 行留空。活跃记录的状态与目录一致；`rejected` 写为 `Status: rejected — <一句话原因>`。

| 状态 | 正文骨架 |
|---|---|
| `proposed` | Problem → Proposal → Alternatives considered → Acceptance criteria → Risks |
| `implemented` | Problem → Decision → Alternatives considered → Consequences |
| `rejected` | Problem → Proposal → Alternatives considered；保留拒绝理由与重访条件 |

- 动机应能脱离方案独立成立；决定说明关键约束、理由及适用范围，不复述实现步骤。
- `Alternatives considered` 保留标题，只写真实考虑过的方案，没有数量要求。没有真实备选就写“无”；资料未记录则如实写“未记录”，不要补造评审历史。
- `Consequences` 写已知收益、代价、限制和有意义的重访条件。没有实测基线，不声称性能或成本有所提升。
- `Verification` 可按需增加，区分实际执行的检查、结果与未验证部分。格式检查通过不能替代工程验证。
- 跨 Note 使用相对 Markdown 链接。源码入口锚点只在宿主已有惯例或确有帮助时添加，不要求遍布代码。
- 使用 [templates/](templates/) 的对应模板，删去指导注释与占位文字。公共 Skill、空白模板和公开示例只保留通用内容；宿主记录按其可见性与任务范围保存本工程必要信息，私有项目资料不回流公共 Skill 仓库。

细节见 [note-format.md](references/note-format.md)、[prose-checklist.md](references/prose-checklist.md)。简化工作按需参考 [simplification-checklist.md](references/simplification-checklist.md)，不要因此扩大当前任务。

## 5. 校验与交付

写改 Note 后，检查理由是否完整、状态是否真实、是否有重复归属，使用 [quality-gate.md](references/quality-gate.md) 自检。能直接修正的缺口自行修正；重要未决取舍按当前授权处理。

工具要求 Node.js 24 或更新版本。保持当前目录为宿主项目根目录，按实际安装位置调用三个校验脚本：

```sh
node .agents/skills/write-notes-like-deepseek/scripts/verify-agent-note-tree.ts
node .agents/skills/write-notes-like-deepseek/scripts/verify-agent-note-format.ts
node .agents/skills/write-notes-like-deepseek/scripts/verify-archived-agent-notes.ts
```

安装在其他位置时替换路径；不要切换到 Skill 目录后误检 Skill 自身。默认 Notes 根为宿主的 `.agents/notes/`，兼容布局可通过 `AGENT_NOTE_ROOT` 指定。安装不会自动创建宿主 npm scripts 或启用 CI。

宿主已经配置对应 npm scripts 时可运行 `npm run verify-notes`。三个校验器分别检查目录与链接、头块与章节、归档封印和可用的 Git 基线。它们不判断理由是否成立、备选是否真实、工程测试是否通过，也不能发现应该记录却没有创建的 Note。环境无法运行时明确报告未执行与原因，不声称通过。

需要 CI 时，可将 `templates/verify-notes.yml` 复制到宿主 `.github/workflows/`，核对安装路径与基线设置。不要把“每次重要改动必带新 Note”作为检查项。

可选工具：`archive-agent-note.ts` 归档；`check-note-anchors.ts` 生成锚点软报告；`build-board.ts` 生成或打包本地看板。按需使用，不自动发布看板。命令与检查边界见 [verification.md](references/verification.md)。

在任务最终交付中汇总更新的记录、重要决定、实际验证结果和剩余缺口即可；无需逐篇向用户重复自检或请求确认。
