# 归档与历史维护

归档用于保存已经退出当前约束的工程历史。仍会指导维护、避免重犯或限定重新引入条件的理由，应在活跃记录中可检索。

## 1. 先判断去向

| 记录情况 | 去向 |
|---|---|
| 决定仍适用，或理由仍影响可预见的工作 | 保持活跃，必要时同步事实 |
| 只被部分取代 | 保留仍适用的内容，明确范围并链接新决定 |
| 被完全取代，独有理由仍有用 | 先转入新活跃记录，不能藏进归档 |
| 有用内容已被完整吸收，旧篇只是重复 | 在授权范围内删除，并修复引用 |
| 已无现行约束，但仍有独立历史追溯价值 | 可归档 implemented 记录 |
| 提案停止推进 | 有防重犯价值则 rejected，否则删除；不归档 |
| rejected 已不再提供独立价值 | 在授权范围内删除，不进入归档 |

不按年龄、篇幅或“已经做完”判断。日常只处理当前任务相关记录，不要求固定周期全库清理。

## 2. 归档操作

先确认仍有用的理由已经保存在活跃位置，修正与本次决定相关的事实，并运行三个 Note 校验器。使用 Node.js 24 或更新版本，从宿主根目录执行；Skill 安装在其他位置时替换前缀。

```sh
node .agents/skills/write-notes-like-deepseek/scripts/archive-agent-note.ts \
  .agents/notes/implemented/<class>/<filename>.md
```

需要在接管决定的新记录中留下历史链接时，可添加：

```sh
node .agents/skills/write-notes-like-deepseek/scripts/archive-agent-note.ts \
  .agents/notes/implemented/<class>/<filename>.md \
  --superseded-by .agents/notes/implemented/<class>/<successor>.md
```

工具会先检查输入路径、活跃 Note 格式、归档目标、现有 manifest、已有封印和可用的 Git 基线。损坏的 JSON、目标已存在、封印变化或无效基线导致失败，不会用空 manifest 覆盖旧记录。不要绕过错误继续移动文件。

校验通过后，工具：

1. 在 `Status: implemented` 下一行加入归档日期，正文作为历史快照保留。
2. 将文件移到 `archived/<class>/`，为其在 `archived/manifest.json` 中记录 SHA-256。
3. 使用 `--superseded-by` 时，在指定活跃 Note 中添加指向历史快照的相对链接。
4. 报告活跃 Notes 中仍指向原路径的相对链接，由维护者修复。

归档头块为：

```markdown
# Agent Note: <标题>

Status: implemented
Archived: YYYY-MM-DD

## Problem
```

`--superseded-by` 的路径必须是同一 Notes 根内另一篇有效活跃记录，不能是归档文件或符号链接。工具校验路径和格式、添加链接，不证明新决定已经落实或完整取代旧决定；实际取代关系仍需审查。

一次只由一名维护者或 Agent 执行归档，不并发修改同一 Notes 树。完成后修复 Notes、代码和文档中受影响的引用，再运行三个校验器。工具报告只覆盖它扫描到的活跃 Note 链接，不替代全仓引用检查。

## 3. 封印与基线

归档文件封印后保持只读：不编辑、翻译、重排、移动或删除。后续修正应写在新的活跃记录中，并按需引用历史。

`verify-archived-agent-notes.ts` 同时检查归档头块、文件与 manifest 的对应关系及 SHA-256。Notes 位于 Git 仓库时，还与 `AGENT_NOTE_ARCHIVE_BASE_REF` 指定的 commit 比较，默认 `HEAD`，防止已有封印条目被改动或删除。CI 应使用变更前的基线，详见 [verification.md](verification.md)。

无 Git 时只能核对本地文件与 manifest 的一致性，会明确提示缺少版本基线；同时修改两者无法由本地哈希证明未改。显式指定基线但无法核对时会失败。

对于已有、尚未封印的有效归档，可显式补录：

```sh
node .agents/skills/write-notes-like-deepseek/scripts/verify-archived-agent-notes.ts --write
```

`--write` 先校验已有条目和可用基线，再添加缺失封印；不修复损坏 manifest，不重写旧封印。补录前须确认这些文件确实应当成为历史快照。

目录与格式校验器不扫描归档正文，归档中的历史出站链接可能失效。归档只能作为历史证据，不能覆盖当前代码、现行记录或用户要求。
