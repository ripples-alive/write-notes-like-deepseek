# Note 文件格式

默认使用随附模板。宿主已有记录规范时沿用；以下格式描述本 Skill 校验器支持的布局，不要求迁移其他 ADR 系统。

## 头块

```markdown
# Agent Note: <标题>

Status: <状态>

## Problem
```

第 1 行是标题，第 2、4 行为空行，第 3 行为唯一状态行：

- `proposed/`：`Status: proposed`
- `implemented/`：`Status: implemented`
- `rejected/`：`Status: rejected — <一句话原因>`

文件名采用 `yyyy-mm-dd-topic.md`，日期为首次提出日。状态变化不修改日期；Git 可保留后续修改历史。

归档保留 `Status: implemented`，在它下一行插入 `Archived: YYYY-MM-DD`，其后空一行。使用归档工具处理，不把状态改为 `archived`。

## 正文骨架

| 状态 | 必需章节 | 内容 |
|---|---|---|
| `proposed` | Problem、Proposal、Alternatives considered、Acceptance criteria、Risks | 问题、拟议选择、真实备选、可观察的完成条件、风险 |
| `implemented` | Problem、Decision、Alternatives considered、Consequences | 问题、已落实的决定、真实备选、收益与代价 |
| `rejected` | Problem、Proposal、Alternatives considered | 曾提出的方案与否决理由；可保留 Risks 或其他相关章节 |

每篇首个二级章节是 `## Problem`。模板按上述顺序排列，必要的技术说明可放在 `Decision` 或 `Proposal` 后。只增加有独立用途的章节。

`implemented` 不使用 `## Proposal`、`## Plan`、`## Migration plan`、`## Acceptance criteria` 及对应中文标题。其 `Decision` 说明已落实事实；历史原因和实测记录不必强改成现在时。

## 备选、后果与证据

`## Alternatives considered` 必须存在，但不要求任何最小数量。对真实考虑过的备选说明它的合理性与未选原因；没有真实备选写“无”。整理旧记录时若资料不足，写明“未记录”或具体不确定性，不编造比较过程。尚未决定的提案不要把候选写成已经否决。

`Consequences` 说明已知收益、代价、限制和适用条件。有意义时说明什么变化会促使重访该决定，避免为每篇凑一套假设。

`Testing` 或 `Verification` 为可选节。写明实际检查的表面、执行结果与未验证部分；仅列命令不代表已执行。性能比较需要基线和测量条件，推测应标明。

## 语言与链接

默认中文正文，宿主已有语言约定时沿用；模板头块和节名保留英文。检查器兼容部分中文节名、标题中的全角冒号及括号后缀，支持的具体别名以随附脚本为准。

跨 Note 使用相对 Markdown 链接，并随移动同步。一个事实尽量只在其归属文档中解释；其他位置链接过去。不要用聊天中的序号或无法访问的临时草稿充当依据。

删除模板中的占位文字和指导注释。写入当前工程必要的事实与理由即可，不复制个人账号、外部工作区信息、跨项目规则或同步配置。
