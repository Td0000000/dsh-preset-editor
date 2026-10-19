# dsh-preset-editor（预设编辑）

DeepSeek Harness 自定义预设可视化编辑插件。

支持对自定义 Agent 预设进行可视化创建、编辑、管理与导入导出，支持 `system`、`user`、`assistant` 消息编排，支持自主配备 AI 工具，直接融入官方 Agent 预设体系，新会话一键选择即可生效。

> **本版本（v1.4.1）已适配 DSH `0.2.1-rc.2`**（见下方「0.2 适配说明」「0.2.1 适配说明」「1.4.1 变更」「1.3.0 变更」）。
>
> 1.4.1 说明：**回退了 1.4.0 的「自定义插件行」**（需求理解有误），改为在「AI 工具」弹窗最下方**只读展示运行时由其它插件提供的 AI 可调用工具**，并自动过滤 DSH 自带工具。

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
4. **AI 工具自由配备（官方中文优先）**
   - 【AI 工具】按钮按需为当前预设勾选工具插件。
   - 名称与说明优先取自官方包自带的中文文案（`locale/zh.json` 的 `meta.title` / `meta.description`），官方没有中文的（定时提醒、精准文本替换）才由本插件补译。
   - 默认工具集与官方 `standard` 预设对齐，并补上官方有、本插件之前缺的：`time-context`（时间感知）、`tool-schedule`（定时提醒）、goal、plan-mode、subagent/workflow。
   - 生成的插件行与官方 `dsh-web-app` 的 `standard` 预设同构，含官方要求的 `isolate` 隔离域（`planMode` / `compaction` / `toolResultPruner` / `workflowEngine`）。
   - **运行时扩展工具（只读）**：弹窗最下方展示当前运行时由**其它插件**提供的 AI 可调用工具（例如 `dsh-im` 的文件发送工具、用户自装插件注册的工具）；**DSH 自带工具会被自动过滤**。这些工具已经在会话里可用，不需要、也不能在预设里单独勾选；只用于让用户看到“这个环境里还有哪些 AI 可调用能力”。
   - DSH 自带工具名维护在 `lib/tools.js` 的 `DSH_BUILTIN_TOOL_NAMES`；官方新增工具时需要补充该清单。
5. **官方模板变量（已校正）**
   - 界面内置【预设说明】入口（原「变量说明」），同时解释预设、三种条目与官方提示词注入规则。
   - DSH `0.2.1-rc.2` 实际只注册 **`{{model}}`、`{{provider}}`** 两个模板变量，仅 `system` 条目会插值。
   - **`{{cwd}}` 已过时**：工作目录现在由 `dsh-working-directory` 作为“运行时上下文”自动注入，不是模板变量。写 `{{cwd}}` 会让整个预设组装失败。
   - 保存 / 导入时会自动校验模板变量：只放行 `model` / `provider`，其余 `{{...}}` 直接报错拦截。
6. **导入 / 导出**
   - 单个预设或全部预设导出为 JSON，一键导入，便于备份与跨机器迁移。

---

## 🧩 0.2 适配说明（相对 0.1.x 的改动）

DSH 0.2 移除了 0.1.x 的「目录即预设」模型，旧实现整体失效，本版本已重写宿主侧：

| 项目 | 0.1.x 旧实现 | 0.2 适配实现 |
|---|---|---|
| 预设存储 | 写入 `$DSH_HOME/.agent-presets/<id>/`（`preset.yml` + `agent.cordis.yml`），靠官方扫描目录 | **官方已不再读取该目录**。改为本插件自有存储 `$DSH_HOME/preset-editor.json` 作为唯一真源；首次运行会把遗留目录里的 `preset.editor.json` 一次性迁移进来 |
| 预设生效 | 目录被官方扫描后出现在名册 | 通过官方 `ctx.agentPresets.register({ id, name, description, order, plugins })` 注册；`plugins` 即该预设的隔离插件树，官方名册与选择器直接可见 |
| system 提示词 | `systemPrompt.section()` + 事件里读 `context.agent` | 生成为该预设自身 `@deepseek-ai/dsh-persona` 的 `prefix`，天然只在预设隔离域内生效。官方公开类型里 `AssembleContext` 没有 `agent` 字段，因此不再依赖它 |
| 工具行 | 拼接 YAML 文本，引用了 0.2 已不存在的 `@deepseek-ai/dsh-workflow-worker-thread` | 直接生成对象行，改用 `@deepseek-ai/dsh-workflow-ptc`，并与官方 `standard` 预设的行/配置对齐 |
| user / assistant 消息注入 | `llm/stream` 里改写整份请求消息数组 | 恢复为**每次**主模型调用前置注入（与 0.1.x 原版一致），见下方「为什么必须每次注入」 |
| **抗上下文压缩** | — | user/assistant 条目**不进会话日志**，走请求级注入，因此不会被 compaction 摘要掉；system 条目走 persona → 系统提示词，官方明确「压缩绝不缩减系统提示词」 |
| 引擎声明 | `engines.dsh: ">=0.1.5-rc.1 <0.2.0"` | `engines.dsh: ">=0.2.0-rc.1 <0.3.0"` |
| 客户端清单 | `dsh.client.inject` 缺少 `@deepseek-ai/dsh-client-ui-slots`，没有 `immediately` | 补齐 `@deepseek-ai/dsh-client-ui-slots` 并设置 `immediately: true`。注意这两项只是**模块到达顺序 / 启动预取提示**，并不决定设置页是否注册——注册走的是 `ctx.slots.inject("settings.section", …)` |
| 客户端主题令牌 | `--dsw-alias-bg-layer-4`、`--dsw-alias-state-warning-primary`（0.2 已不存在/改名） | 改为 `--dsw-alias-bg-overlay`、`--dsw-alias-state-warn-primary`；并删除未使用的 `--dsw-alias-brand-hover` |
| **按钮填充色（白底白字 bug）** | 用 `--dsw-alias-brand-primary` 当**填充色**再配硬编码白字 | `--dsw-alias-brand-primary` 是「反色前景色」（浅色主题近黑、深色主题近白），只能用于文字/描边。填充改为官方的 `--dsw-alias-button-primary-fill` + `--dsw-alias-label-primary-inverted` 配对。修复前深色主题对比度仅 **1.05:1**（白底白字），修复后 **11.57:1** |
| 客户端代码 | `client.js` 的加载器格式、React 取用、slot 注册在 0.2 未变 | **结构性代码无需改动**（仅修了上面 2 个主题令牌名） |

### 0.2.1 适配说明（v1.2.0）

针对 DSH `0.2.1-rc.2` 的官方包逐项核对后，改动如下：

| 问题 | 0.2.1 官方事实 | 本版本处理 |
|---|---|---|
| `tool-subagent` 的 `backgroundMode: "continuable"` | 0.2.1 的 `@deepseek-ai/dsh-tool-subagent` 已删除该 Config 项（只接受 `provider` / `toolName` / `modelSelectionSettings` / `agentOptions` / `agentPreset` / `allowedAgentPresets` / `maxDepth`）。0.2.1 的每次委派本身就是「启动子代理后立即返回 `started subagent <childId>` + 完成通知」，本地 spawn/fork 子代理还可在运行中 `send_message`、结束后恢复。schemastery 非 strict，旧键会被**静默忽略**，看起来没报错但语义靠运气 | 删除 `backgroundMode` 键，其余合法键保留；后台/续聊语义由 0.2.1 运行时内建保证，不再需要声明 |
| 空 `system` 条目生成 `persona: {}` | 0.2.1 的 `@deepseek-ai/dsh-persona` 中 `prefix` 是必填的非空字符串；生成 `config: {}` 会让 Loader 校验失败，整个预设变成 broken | `system` 文本为空时**不插入 persona 行**（预设沿用部署默认人格），非空时仍生成 `{ prefix: systemText }` |
| 插件显示元数据 | 0.2.1 不读 `dsh.plugin.json`；改为从包的 `package.json.icon`（包内相对路径，SVG/PNG/JPEG/WebP，≤256 KiB）与 `./locale/*.json` 的 `meta.title` / `meta.description` 读取，并经 module resolver 解析 | 新增包根 `icon.svg`、`locale/en.json`（英文回退）、`locale/zh.json`；`package.json` 补根字段 `"icon": "./icon.svg"`、`dsh.manifestVersion: 1`、`exports["./locale/*.json"]`，`files` 补 `locale` / `icon.svg` |
| 版本 | — | `1.1.0` → `1.2.0` |

### 1.4.1 变更（v1.4.1，2026-10-19）

| 问题 | 事实 | 本版本处理 |
|---|---|---|
| 1.4.0 的「自定义插件行」理解错了需求 | 用户要的是在工具选择最下方**看到**其它插件提供的 AI 可调用工具，而不是给预设加任意插件行 | 回退 `customPlugins` 数据/UI/校验/文档；数据文件里即使残留该字段也会被忽略 |
| 运行时工具与 DSH 自带工具混在一起 | `ctx.tools.schemas()`（不带 scope）返回宿主全局视图，其中既有 DSH 自带工具，也有其它插件注册的工具，且没有来源字段 | 新增 `DSH_BUILTIN_TOOL_NAMES` 官方工具名清单 + `filterRuntimeTools()`：工具弹窗最下方只展示**不在清单里**的工具（即其它插件提供），DSH 自带自动过滤；列表只读，并显示过滤数量 |
| 运行时工具不能挂进预设 | 工具名不是插件行，没有“工具 → 插件包”的可靠映射 | 只读展示并明确说明“已在会话可用，不需要也不能在这里勾选”，避免再次误导 |
| 版本 | — | `1.3.0` → `1.4.1`（1.4.0 已回退） |

### 1.3.0 变更（v1.3.0，2026-10-19）

| 问题 | 官方事实 | 本版本处理 |
|---|---|---|
| `{{cwd}}` 模板变量 | DSH 0.2.1 的 prompt 变量只由 core 注册 `provider` / `model` 两个；`dsh-system-prompt/README.zh.md` 明确要求移除 `{{cwd}}`，工作目录改由 `dsh-working-directory` 作为必需运行时上下文注入。未注册变量会在 `renderPrompt()` 抛错，整个预设不可用 | UI/README/注释删除 `{{cwd}}`；【变量说明】改为【预设说明】；system 输入框与示例只保留 `{{model}}` / `{{provider}}` |
| 模板变量写错无法及时发现 | 严格插值：未知变量、无值变量、格式错误都会在每次请求前让组装失败 | 保存 / 导入时校验 `system` 条目：只允许 `model`、`provider`，其余 `{{...}}` 直接拦截并提示 |
| 官方中文文案没复用 | 官方工具包自带 `locale/zh.json` 的 `meta.title` / `meta.description`（Bash、PowerShell、文件、搜索、Jobs、Web、Skill、提问、Todo、Present、Goal、Plan、Subagent、Workflow、Compaction、Cordis API 查询等） | AI 工具清单改用官方中文；官方无中文的（`tool-schedule`、`tool-str-replace-editor`）由本插件补译 |
| 工具清单缺项 | 官方 `standard` 预设默认包含 `time-context`、`tool-schedule`、goal、plan-mode、subagent/workflow | 全部补上，默认勾选与官方 `standard` 对齐；新增 `tool-cordis`（默认关闭，依赖宿主 Inspect 提供者） |
| 宿主级工具被误列为可勾选 | 团队工具、会话检索、Ralph、工作树、IM 文件发送、pwd/cd、插件管理面等由宿主/其它插件直接提供；预设里重复挂载会重复注册或服务缺失 | 从“AI 工具”清单移除运行时工具合并（1.4.1 改为在最下方只读展示，并过滤 DSH 自带工具） |
| plan-mode 文案过时 | 官方 standard 的 planning 段已更新（直到用户批准/切换模式、exit_plan_mode 约束等） | `tools.js` 的 `PLAN_MODE_SECTION` 与官方 `0.2.1-rc.2` 同步 |
| 版本 | — | `1.2.0` → `1.3.0` |

### 为什么必须每次注入（抗压缩）

DSH 的压缩（`@deepseek-ai/dsh-compaction-basic`）在 token 压力越过阈值时，
会把**最旧的一段表层历史**替换成一条带 `<compacted-summary>` 的 user 消息，
只逐字保留近期约 16% 的历史（`retainRatio: 0.16`）。

推论：

- 凡是**进入会话日志**的内容，早晚都会被压缩掉；
- 官方文档明确：**压缩绝不缩减系统提示词、工具或会话前缀**。

所以三种条目的抗压缩能力天然不同：

| 条目 | 去向 | 会不会被压缩掉 |
|---|---|---|
| `system` | persona → 系统提示词 | ❌ 不会（官方保证） |
| `user` | 请求级注入，每次调用都在场 | ❌ 不会 |
| `assistant` | 请求级注入，每次调用都在场 | ❌ 不会 |

> 早期实现曾把 `user` 条目通过 `agent/pre-step` 播种进会话日志、`assistant` 条目只注入一次。
> 实测显示：压缩发生后两者都会消失，因为日志里的注入消息正是「最旧的历史」，
> 而只注入一次的 assistant 消息从第二轮起就不在任何地方了。现为每次注入。
> 代价：`user` / `assistant` 条目是**请求可见但不入会话日志**的引导消息，不会出现在对话记录里。
> 这是为了抗压缩而做的取舍：要让它们既入日志又不被压缩，DSH 当前没有受支持的入口。

### 已知限制

- `user` / `assistant` 条目不会出现在对话记录里（见上）。
- 预设注册在插件启用期间有效；禁用本插件后，它注册的预设会一并消失。
- `system` 里不支持字面量 `{{`：DSH 目前没有转义语法，任何完整 `{{...}}` 组都会被当作变量引用。保存时校验会拦截。
- 预设一旦写了 system 文本，就会**替换**部署默认人格（`dsh-persona` 同名 section 遮蔽部署级），不会自动保留官方的 `You are a coding agent powered by ...` 行；如需保留请在 system 里自己写。
- 自定义插件行已回退：预设只挂载 `enabledTools` 对应的官方工具行，不接受任意第三方插件行。
- 运行时扩展工具列表是**只读展示**：它来自 `ctx.tools.schemas()` 的宿主全局视图，不能按预设启用；DSH 自带工具按静态名单过滤，官方新增工具时需要更新 `DSH_BUILTIN_TOOL_NAMES`。

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
- HTTP 接口（供 UI 与外部工具使用）：
  - `GET /dsh-preset-editor/state`（`?diagnostics=1` 附带挂载诊断）
  - `GET /dsh-preset-editor/tools`（返回可挂载工具 + 其它插件运行时提供的工具 `runtimeTools` + 被过滤的 DSH 自带工具数量 `filteredDshCount`）
  - `POST /dsh-preset-editor/save` / `delete` / `import`
  - `GET /dsh-preset-editor/export`（`?id=` 或 `?all=1`）

---

## 兼容性说明

- **框架版本**：DeepSeek Harness `0.2.1-rc.2`（`0.2.x` 系列；`engines.dsh: ">=0.2.0-rc.1 <0.3.0"`）。
- **微内核**：基于 `@deepseek-ai/cordis` `^4.0.1`。
- **环境要求**：Node.js >= 20。

---

## 📄 许可证

本项目沿用宽松开源协议：[MIT License](LICENSE)。
