# dsh-preset-editor（预设编辑）

DeepSeek Harness 自定义预设可视化编辑插件。

支持对自定义 Agent 预设进行可视化创建、编辑、管理与导入导出，支持 `system`、`user`、`assistant` 消息编排，支持自主配备 AI 工具，直接融入官方 Agent 预设体系，新会话一键选择即可生效。

> **本版本已适配 DSH `0.2.0-rc.x`**（见下方「0.2 适配说明」）。

---

## 💡 致谢与灵感来源

本项目的灵感源自原作者 **[Rain-kl](https://github.com/Rain-kl)** 的开源项目 **[dsh-preset-plus](https://github.com/Rain-kl/dsh-preset-plus)**，非常感谢原作者的开源分享与探索！

---

## 🌟 核心特性

1. **完全符合官方预设体系**
   - 编辑器里的每个预设都会通过官方 `agentPresets` 服务注册为标准的 Agent 预设声明，直接出现在官方设置的【自定义预设】与聊天界面右上角的【Agent 预设选择器】中。
2. **零命令、无感生效**
   - 没有任何 `/` 斜杠命令；在新建会话时选择对应预设即可生效。
   - **精确隔离**：预设的系统提示词与工具挂载在该预设自己的隔离域内，官方内置预设（standard、minimal、ptc、cordis 等）保持纯净。
3. **可视化消息编排与顶级强约束**
   - 标准角色字段：`system`、`user`、`assistant`。
   - **顶级强约束**：预设首条（`#1`）强制固定为启用的 `system` 消息，不可关闭、不可删除、不可移出首位。
   - 支持 `↑ 上移` / `↓ 下移` 调整条目顺序，每条支持独立启用/停用、实时修改与删除。
4. **AI 工具自由配备**
   - 【AI 工具】按钮按需为当前预设勾选工具插件（Bash、PowerShell、文件操作、文件检索、精准替换编辑器、后台任务、网页检索、技能系统、询问用户、Todo、子代理、工作流、计划模式、上下文压缩、交付物卡片等）。
   - 生成的插件行与官方 `dsh-web-app` 的 `standard` 预设同构，含官方要求的 `isolate` 隔离域（`planMode` / `compaction` / `toolResultPruner` / `workflowEngine`）。
5. **官方 `{{}}` 模板变量**
   - 界面内置【`{{}}` 变量说明】入口：`{{model}}`、`{{provider}}`、`{{cwd}}`。
   - 模板变量由 DSH 核心装配引擎解析，仅支持在 `system` 中使用。
6. **导入 / 导出**
   - 单个预设或全部预设导出为 JSON，一键导入，便于备份与跨机器迁移。

---

## 🧩 0.2 适配说明（相对 0.1.x 的改动）

DSH 0.2 移除了 0.1.x 的「目录即预设」模型，旧实现整体失效，本版本已重写宿主侧：

| 项目 | 0.1.x 旧实现 | 0.2 适配实现 |
|---|---|---|
| 预设存储 | 写入 `$DSH_HOME/.agent-presets/<id>/`（`preset.yml` + `agent.cordis.yml`），靠官方扫描目录 | **官方已不再读取该目录**。改为本插件自有存储 `$DSH_HOME/preset-editor.json` 作为唯一真源；首次运行会把遗留目录里的 `preset.editor.json` 一次性迁移进来 |
| 预设生效 | 目录被官方扫描后出现在名册 | 通过官方 `ctx.agentPresets.register({ id, name, description, order, plugins })` 注册；`plugins` 即该预设的隔离插件树，官方名册与选择器直接可见 |
| system 提示词 | `systemPrompt.section()` + 事件里读 `context.agent`（0.2 的 `AssembleContext` 已无 `agent` 字段，旧写法永远返回空串） | 生成为该预设自身 `@deepseek-ai/dsh-persona` 的 `prefix`，天然只在预设隔离域内生效，支持 `{{}}` 变量 |
| 工具行 | 拼接 YAML 文本，引用了 0.2 已不存在的 `@deepseek-ai/dsh-workflow-worker-thread` | 直接生成对象行，改用 `@deepseek-ai/dsh-workflow-ptc`，并与官方 `standard` 预设的行/配置对齐 |
| user 消息注入 | `llm/stream` 里改写整份请求消息数组 | 会话首个 turn 通过官方 `agent/pre-step` 瀑布播种为真实 user 消息（因此会入会话日志，符合官方「模型可见 ⟺ 已入日志」约束） |
| assistant 消息注入 | 同左 | 保留 `llm/stream` 前置注入（0.2 没有受支持的「伪造 assistant 历史」入口），每个会话只注入一次 |
| 引擎声明 | `engines.dsh: ">=0.1.5-rc.1 <0.2.0"` | `engines.dsh: ">=0.2.0-rc.1 <0.3.0"` |
| 客户端清单 | `dsh.client.inject` 缺少 `@deepseek-ai/dsh-client-ui-slots`，没有 `immediately` | 补齐 `@deepseek-ai/dsh-client-ui-slots` 并设置 `immediately: true`。注意这两项只是**模块到达顺序 / 启动预取提示**，并不决定设置页是否注册——注册走的是 `ctx.slots.inject("settings.section", …)` |
| 客户端主题令牌 | `--dsw-alias-bg-layer-4`、`--dsw-alias-state-warning-primary`（0.2 已不存在/改名） | 改为 `--dsw-alias-bg-overlay`、`--dsw-alias-state-warn-primary`；并删除未使用的 `--dsw-alias-brand-hover` |
| **按钮填充色（白底白字 bug）** | 用 `--dsw-alias-brand-primary` 当**填充色**再配硬编码白字 | `--dsw-alias-brand-primary` 是「反色前景色」（浅色主题近黑、深色主题近白），只能用于文字/描边。填充改为官方的 `--dsw-alias-button-primary-fill` + `--dsw-alias-label-primary-inverted` 配对。修复前深色主题对比度仅 **1.05:1**（白底白字），修复后 **11.57:1** |
| 客户端代码 | `client.js` 的加载器格式、React 取用、slot 注册在 0.2 未变 | **结构性代码无需改动**（仅修了上面 2 个主题令牌名） |

### 已知限制

- `assistant` 条目是「请求可见但不入会话日志」的引导消息（官方 0.2 未提供伪造 assistant 历史的正规入口），因此它不会出现在对话记录里。
- `user` 条目在会话首个 turn 播种进日志，会作为一条 user 消息出现在该会话开头。
- 预设注册在插件启用期间有效；禁用本插件后，它注册的预设会一并消失。

---

## 📦 安装

```bash
# 1. 克隆到插件目录
git clone https://github.com/Td0000000/dsh-preset-editor.git ~/.dsh/plugins/dsh-preset-editor
```

然后在 DSH 里安装该 bundle（二选一）：

- **推荐**：用 DSH 的 `plugin_manager` 以 `install_bundle` 安装，`target` 传该目录的绝对路径；
- 或在「设置 → 插件」中把该目录作为本地插件安装。

安装完成后：

- 设置页左侧出现【预设编辑】入口；
- 在【新建预设】里填写系统提示词、消息条目并勾选工具，保存后新开对话，在右上角预设选择器中选择该预设即可生效。

---

## 🗂 数据位置

- 预设存储：`$DSH_HOME/preset-editor.json`（`$DSH_HOME` 默认 `~/.dsh`）
- 旧版遗留目录（仅一次性迁移，之后不再使用）：`$DSH_HOME/.agent-presets/`

---

## 兼容性说明

- **框架版本**：DeepSeek Harness `0.2.0-rc.1` ~ `0.2.x`（Desktop / Web profile）。
- **微内核**：基于 `@deepseek-ai/cordis` `^4.0.1`。
- **环境要求**：Node.js >= 20。

---

## 📄 许可证

本项目沿用宽松开源协议：[MIT License](LICENSE)。
