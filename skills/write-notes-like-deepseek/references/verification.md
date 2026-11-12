# 校验工具与运行方式

所有脚本随 Skill 分发，宿主沿用 `npx tsx` 入口；已有 Node.js 24 或更新版本时也可直接用 `node`。首次调用可能需要获取 `tsx`。从宿主工程根目录运行，并使用实际安装路径；安装不会自动配置 npm scripts 或启用 CI。

## 三个校验器

| 工具 | 检查范围 |
|---|---|
| `verify-agent-note-tree.ts` | 活跃记录的生命周期、六类目录、路径深度、文件名形状、禁止 `INDEX.md`，以及识别到的笔记间相对 Markdown 链接 |
| `verify-agent-note-format.ts` | 头块、状态与目录一致、必需章节、备选章节存在，以及 implemented 中残留的提案标题 |
| `verify-archived-agent-notes.ts` | 归档头块、文件与 manifest 的对应关系、SHA-256，以及相对可用 Git 基线的只增不改 |

```sh
npx tsx .agents/skills/write-notes-like-deepseek/scripts/verify-agent-note-tree.ts
npx tsx .agents/skills/write-notes-like-deepseek/scripts/verify-agent-note-format.ts
npx tsx .agents/skills/write-notes-like-deepseek/scripts/verify-archived-agent-notes.ts
```

项目级、全局或其他目录安装时，替换命令前缀。默认 Notes 根为当前目录下 `.agents/notes/`；可用 `AGENT_NOTE_ROOT` 指定其他符合布局的根目录。

三个检查器全部运行。新工程没有 Notes 或归档时可以为空；这不是要求建立空目录。已有归档是否被移除，还需要检查 Git 基线，不能因当前目录消失就跳过。

## 格式检查的边界

- 模板固定英文头块与节名；脚本也识别部分中文别名、标题全角冒号及章节括号后缀。
- 代码块、引用和 HTML 注释中的示例不充当正文结构；CRLF 和 BOM 在格式解析时归一。
- 新记录需要备选章节，可以诚实写“无”或“未记录”，脚本不检查数量和真实性。已有记录保留 [note-format.md](note-format.md) 中的旧日期与精确标记兼容规则；独立校验和归档预检使用同一规则，不要求补写历史。
- `implemented` 的当前状态描述由作者负责；检查器仅拒绝提案类标题，不扫描正文时态。
- 结构通过不能证明理由正确、内容完整、工程测试已执行，也不能发现应该创建却没有创建的 Note。真实工程验证仍按宿主要求完成。

## Git 基线与 CI

`AGENT_NOTE_ARCHIVE_BASE_REF` 应指向变更前的有效 commit：PR 使用目标分支的基线，已有分支 push 使用事件的前一个 commit。本地默认 `HEAD`，可检查尚未提交的变更；CI 用当前变更的 `HEAD` 无法约束同一提交中对旧封印的重写。

校验器在 Notes 所在位置查找 Git 仓库，不把另一个当前目录的仓库当作它的历史：

- 基线 commit 有效，但当时尚无 manifest：允许初始化。
- 空 Git 仓库还没有 commit：默认 `HEAD` 可初始化；显式无效 ref 仍失败。
- Git 仓库中的基线无法解析或读取：失败，不当作“历史为空”。浅克隆应取回所需基线。
- Notes 不在 Git 仓库：仅核对本地文件与 manifest，并提示缺少历史比较；若显式要求基线则失败。

新分支首次 push 的事件基线可能是全零值。CI 需要明确区分这种初始化事件，不能把全零值传给校验器或默默把所有无效 ref 当作初始化。随附模板在此事件中使用当前仓库 `origin` 默认分支的共同祖先，按宿主历史和发布要求核对基线选择。

需要接入时，将 `templates/verify-notes.yml` 复制到宿主 `.github/workflows/verify-notes.yml`，核对 Skill 安装路径。模板留在 Skill 目录里不会运行。宿主已配置同名 npm scripts 时，可使用 `npm run verify-notes` 串行运行三个校验器。

## 归档与可选工具

归档前后运行三个校验器；归档命令、补录封印及只读规则见 [archiving.md](archiving.md)。

`check-note-anchors.ts` 是可选软报告，扫描代码中的 `// Note:` 或 `# Note:` 路径锚点，报告缺路径、无效锚点和未被锚点引用的 implemented 记录。默认代码根为当前目录，可通过 `AGENT_NOTE_CODE_ROOT` 指定。退出码不表示这些报告已解决，不作为 CI 必需项。

```sh
npx tsx .agents/skills/write-notes-like-deepseek/scripts/check-note-anchors.ts
npx tsx .agents/skills/write-notes-like-deepseek/scripts/build-board.ts --init board.html '工程决定'
npx tsx .agents/skills/write-notes-like-deepseek/scripts/build-board.ts --bundle .agents/notes demo.html '工程决定'
```

看板为可选查看方式；打包文件包含所选笔记正文。只按当前任务授权保存或发布，不自动对外上传，也不把宿主记录打包进公共 Skill 仓库。
