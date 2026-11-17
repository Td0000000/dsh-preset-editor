# dsh-preset-editor（预设编辑）

DeepSeek Harness 自定义预设可视化编辑插件。

支持对自定义 Agent 预设进行可视化创建、编辑、管理与导入导出，支持 `system`、`user`、`assistant` 消息编排，支持自主配备 AI 工具，直接融入官方 Agent 预设体系，新会话一键选择即可生效。

> **本版本（v1.10.0）适配 DSH NEXT `2.0.22-next`（内核 DeepSeek Harness `0.2.2-rc.3`）**（见下方「0.2.2 适配说明」及历史适配记录）。
>
> 1.10.0 修复：①手动新建会话时工作目录在子文件夹里不套用规则——项目默认规则现在**默认包含子文件夹**（就近规则优先，可在单条规则上取消「包含子文件夹」）；②「当前预设」页新增**统一的默认模型绑定区**，自定义预设和官方预设都能直接设置（之前自定义预设必须进编辑页，官方在单独区域）。
>
> 1.9.0 更新：官方内置预设在本插件 UI 里显示中文名（标准 / 极简 / PTC 程序化工具调用 / Cordis 内核）；明确并实现“预设和模型都只是默认值”——用户手动改过后不再覆盖；修复“用户手选官方默认预设会被目录规则改回”的问题。
>
> 1.8.0 新增：**任意预设（含 DSH 官方内置）都可以绑定默认上游模型与思考强度**。自定义预设在编辑页底部设置；官方内置预设在「当前预设」页的官方预设列表里设置。模型列表来自 DSH 当前已配置的上游。
>
> 1.7.0 新增：①「项目默认预设」的规则可以选择 **DSH 官方内置预设**（standard / minimal / ptc / cordis），不再只限自定义预设；②自定义预设可绑定默认上游模型与思考强度。见下方「按项目文件夹默认预设」和「预设默认模型」。
>
> 1.6.0 新增：**按项目文件夹默认预设**——可以给不同项目文件夹指定默认 Agent 预设，新建会话时按工作目录自动套用；功能有总开关、规则可逐条启停，不修改 DSH 官方默认预设，用户手动选择的预设优先。
>
> 1.5.1 说明：**修复 0.2.2 内核下所有自定义预设变成 broken 的根因**——`@deepseek-ai/dsh-tool-subagent-control` 删除了 `./list-agents` 子路径导出，旧预设里的 `tool-subagent-list-agents` 行无法解析，导致挂载失败、预设不可用。同时同步 0.2.2 的子代理 `modelSelection`/`modelDiscovery` 配置、官方新增的插件管理工具行与内置工具名单，并补上插件卸载/热重载时的预设与路由清理。
>
> 历史：1.4.1 回退了 1.4.0 的「自定义插件行」（需求理解有误），改为在「AI 工具」弹窗最下方**只读展示运行时由其它插件提供的 AI 可调用工具**，并自动过滤 DSH 自带工具。

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
7. **按项目文件夹默认预设（v1.6.0 新增 / v1.10.0 支持子文件夹继承）**
   - 在设置页【预设编辑 → 项目默认】里给不同项目文件夹指定默认预设；新建会话时按会话工作目录自动套用。
   - 规则默认**包含该文件夹下的所有子文件夹**（就近规则优先；可在单条规则上取消「包含子文件夹」，退回精确匹配）。
   - 规则目标可以是**自定义预设**，也可以是 **DSH 官方内置预设**（standard / minimal / ptc / cordis）。
   - 功能有总开关，规则可逐条启用/停用；不修改 DSH 官方默认预设，也不影响没有配置规则的目录。
   - 用户在新会话顶部手动选择了别的预设时，以用户选择为准；子代理 / fork 派生会话不受影响。
8. **预设默认模型与思考强度（v1.7.0 新增 / v1.8.0 支持官方预设）**
   - **每个预设**（自定义预设 + DSH 官方内置预设）都可以绑定一个默认「上游 provider + 模型 + 思考强度」；会话使用该预设且尚未显式选择模型时自动套用。
   - 模型列表实时来自 DSH 已配置的上游（`/dsh-preset-editor/models`），不是写死的清单。
   - 会话已经有显式模型选择（用户手动改过模型）时不会被覆盖；模型不可用/未配置时自动跳过并记录诊断。
   - 不修改 DSH 的全局默认模型：绑定只写入当前会话的模型选择（`model/selection` 事件）。
   - 自定义预设绑定的存储位置：预设对象 `model` 字段；官方预设绑定在文档级 `presetModels[presetId]` 映射（官方定义保持只读）。

---

## 🧷 按项目文件夹默认预设（v1.6.0 新增）

### 怎么用

1. 打开「设置 → 预设编辑 → 项目默认」。
2. 选择（或粘贴）项目文件夹绝对路径，再选择该文件夹要使用的预设（下拉里【自定义】/【官方】都有标注），点「加入规则」。规则右侧的「包含子文件夹」默认勾选，表示该文件夹下的所有子目录都继承这条规则；取消后只匹配该目录本身。
3. 点「保存设置」。之后在该文件夹（及其子文件夹）里新建会话，会话开始第一轮之前会自动切换到规则指定的预设。
4. 顶部「总开关」控制整个功能；每条规则左侧的勾选框控制单条规则。默认关闭，避免影响现有使用习惯。
5. 父文件夹和子文件夹都配了规则时，**路径更长（更具体）的规则优先**；子目录没有自己的规则就继承最近的父规则。

### 优先级与边界

| 情况 | 结果 |
|---|---|
| 总开关关闭 / 目录没配规则 / 规则被停用 | 完全跟随 DSH 官方默认预设（或调用方显式指定的预设） |
| 会话目录等于规则目录，或位于规则目录之下（规则开启了「包含子文件夹」） | 自动切换到该规则预设，效果等同于用户在新会话顶部手动选择 |
| 多条规则同时命中（父目录 + 子目录） | 路径最长的那条规则生效（就近优先） |
| 规则关闭了「包含子文件夹」 | 只有目录完全一致才命中 |
| 规则目标是官方内置预设 | 同样通过 `agentPresets.select()` 切换，和自定义预设无差别；本插件不会改官方默认 |
| 用户在新会话顶部手动选择了另一个预设 | 以用户选择为准，规则不覆盖 |
| New Session 复用同一个 workspace 里**活着的** blank 会话 | 宿主会把它改回官方默认；插件监听到 `agent-preset/selected` 后重新套用目录规则（若用户显式选了别的预设则保持用户选择） |
| 规则引用的预设被删除 / 挂载失败 | 跳过该规则，回退 DSH 默认预设，并在诊断区记录原因 |
| 子代理、fork 派生会话（`origin=subagent` / `parentSession` / `isSeeded`） | 继承父级组合，不应用规则 |
| 已经开始的会话 | 不会中途换预设（DSH 本身也不允许） |

实现方式（只使用官方公开扩展点）：宿主在 `agent/created`（serial 事件，创建返回前）读取 `SessionHeader.cwd`，用 `findProjectRule()` 在规则里做**路径前缀匹配**（相等或子目录，取最长路径），命中且会话空白时调用官方 `ctx.agentPresets.select(agent, presetId)`。选择会按官方规则写入会话日志（`agent-preset/selected`），重启后按 projection 恢复。另有一个兜底：监听 `session/event`，如果 blank 会话被改回官方默认（典型场景是 New Session 复用活着的 blank 会话），就把目录规则再套回去。为了区分“宿主复用重置”和“用户手选官方默认”，插件在启动时给 `sessionController.create()` 包了一层只读标记（插件卸载时还原），只有带 `sessionId` 的复用创建才允许兜底纠正；用户手选（包括选官方默认）一律尊重。插件**从不改写** `agent-preset-registry` 的 `default` / `selectedDefault` 配置，因此不会与 DSH 自己的默认预设冲突。

> 匹配细节：Windows 路径不区分大小写、忽略末尾分隔符；父规则默认覆盖所有子目录，子目录规则更具体时优先；单条规则可取消「包含子文件夹」退回精确匹配。相邻但名字前缀相同的目录（如 `ProjOne` 与 `ProjOneSibling`）不会误匹配。
>
> 规则保存在 `$DSH_HOME/preset-editor.json` 的 `projectDefaults` 字段里（每条规则含 `subfolders` 开关）；整体导出会带上该字段，导入整体备份时会一并恢复。

### 预设默认模型与思考强度（v1.7.0 新增，v1.8.0 扩展到官方预设，v1.9.0 明确“默认值”语义，v1.10.0 统一入口）

- **统一入口**：「当前预设」页面下方新增「默认模型与思考强度（任意预设）」区域，自定义预设和官方内置预设都在这里直接选择上游 / 模型 / 思考强度并保存；自定义预设也可以继续在「编辑预设」页底部设置（两处修改的是同一个 `preset.model` 字段）。
- **官方内置预设**：定义只读，绑定保存在文档级 `presetModels[presetId]`；官方预设在本插件 UI 里显示中文名：标准 / 极简 / PTC 程序化工具调用 / Cordis 内核（DSH 自己右上角预设选择器里的名字不受影响）。
- **只是默认值**：会话使用该预设、且还没有“用户自己选的模型”时，写入当前会话的模型选择（`agent.model.select()`）。以下情况不生效：
  - 用户手动改过模型 → 保持用户选择，之后再切预设也不覆盖；
  - 用户在会话里手动换过预设 → 预设跟随用户，模型默认只在“之前记录的就是插件自动写入的默认值”时更新（例如切换预设会带出新预设的默认模型）；
  - 模型未在 DSH 上游目录里 / provider 未配置 / 思考强度不被支持 → 跳过并记录诊断，会话保持当前模型。
- **不会改 DSH 全局默认模型**：没有调用会保存全局默认的接口，只写当前会话。
- 保存时按当前模型目录校验展示；运行时会再校验一次，避免上游配置变更后预设不可用。
- 接口：`GET /dsh-preset-editor/models` 拉上游模型目录；`POST /dsh-preset-editor/preset-model` 保存/清除任意预设（含官方）的模型绑定（自定义写回预设定义，官方写 `presetModels`）。

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

### 0.2.2 适配说明（v1.5.1，2026-11-05）

DSH NEXT `2.0.22-next` 把内核升级到 `0.2.2-rc.1`（Cordis `4.1.0`）。本次逐项核对后，改动如下：

| 问题 | 0.2.2 官方事实 | 本版本处理 |
|---|---|---|
| **所有自定义预设变成 broken、无法在新会话选择（本次失效根因）** | `@deepseek-ai/dsh-tool-subagent-control` 的 `exports` 已删除 `./list-agents` 子路径；root 包一次注册 `send_message` / `interrupt_agent` / `list_agents` 三个工具。旧行 `tool-subagent-list-agents` 解析失败 → 该 child row `never started` → 整棵预设挂载失败（`agentPresets.list()` 返回 `broken`，`retain()`/会话绑定直接拒绝） | 删除 `/list-agents` 行，只保留 root 包行；所有含「子代理与工作流」工具的预设恢复正常挂载 |
| 子代理模型选择配置失效 | `@deepseek-ai/dsh-tool-subagent` 的 Config 删除 `modelSelectionSettings`，拆成 `modelSelection` + `modelDiscovery`；官方 standard 在 spawn 实例开启两者、fork 实例保持关闭 | spawn 实例改为 `modelSelection: true, modelDiscovery: true`；fork 实例保持不开启（与官方一致，保 KV Cache 前缀复用） |
| 官方 standard 新增插件管理工具行 | 0.2.2 的 `standard` 预设插入 `@deepseek-ai/dsh-plugin-manager/tools`，条件 `!!js "!ctx.get('profileContext')"`（无 profile 环境禁用） | 新增「插件管理工具」选项并默认勾选；行上的 `disabled` 由插件按当前宿主是否有 `profileContext` 计算，与官方条件同义 |
| `tool-fs` 新增 `applyPatch` 开关 | 0.2.2 的 `tool-fs` Config 新增 `applyPatch`（默认 false）；官方 standard 显式写 `applyPatch: false` | 生成行显式写 `applyPatch: false`（行为与之前一致，只是明确化） |
| 内置工具名单过时 | 0.2.2 新增 `create_skill` / `plugin_manager` / `plugin_market` / `schedule_view` / `schedule_edit`（`schedule_update`、`schedule_delete` 合并进 `schedule_edit`）与 `apply_patch`（tool-fs 的开关） | 补充进 `lib/tools.js` 的 `DSH_BUILTIN_TOOL_NAMES`；旧名字保留，兼容历史环境 |
| 宿主 API 是否变化 | 逐项核对：`agentPresets.register()` / `composedPreset()`、`ctx.agents.get()`、`ctx.tools.schemas()`、`ctx.webServer.register()`（仍是 node 风格 `handler(req, res)`）、`llm/stream` waterfall、`export const inject` / `export function apply` 均未变 | 宿主侧逻辑无需结构性改动 |
| loop 请求被 deep-freeze | 0.2.2 的 agent-loop 构造请求后 `deepFreeze`，官方约定 listener「只读、不改写」；`user`/`assistant` 请求级注入仍是 waterfall 允许的改写方式 | 注入器继续「不修改原 options，只用 `{ ...options, messages: [...] }` 发起新请求」，并用 WeakSet 防重入；实机验证注入生效 |
| **插件热更新 / 禁用重载会留下脏状态** | 2.0.22 新增「插件 → 已安装」一键更新，插件行会被 HMR 重载。旧版宿主插件没有在卸载时注销自己注册的官方预设与 HTTP 路由，实测重载时报 `duplicate exact route "/dsh-preset-editor/state"` 与 `Duplicate agent preset`，新实例无法挂载 | `apply()` 里用 `ctx.effect` 注册卸载清理：停止后续同步、注销全部预设、释放全部 HTTP 路由；单条路由注册失败降级为警告（便于跨版本热更新） |
| 客户端与设置页 | `settings.section` 注册方式、slot 选项、`window.__ModuleLoader__.load` 工厂格式、`/dsh-preset-editor/*` 同源 fetch、主题 token 在 0.2.2 均可用 | `client.js` 无需结构性改动；主题 token 沿用（实测页面正常渲染） |
| 版本与兼容范围 | 内核 `0.2.2-rc.1`、Cordis `4.1.0` | `version` → `1.5.1`；`engines.dsh` → `>=0.2.2-rc.1 <0.3.0`；`peerDependencies.@deepseek-ai/cordis` → `~4.1.0` |

**0.2.2 实机验证（隔离 profile + 官方 Host 启动器）**：插件可正常激活；`/dsh-preset-editor/state?diagnostics=1` 对所有预设返回 `ok: true`（含旧版遗留预设），启动日志不再出现 `never started`；设置页左侧出现【预设编辑】并正常读取数据；用自定义预设发起一轮真实对话，主模型请求实际收到 `system` persona 与每次请求前置的 `user`/`assistant` 注入条目；插件卸载/重载时会注销预设与路由。

### 1.6.0 新增：按项目文件夹默认预设（2026-11-17）

| 决策 | 官方 0.2.2 事实 | 本版本处理 |
|---|---|---|
| 在哪里按目录改预设 | 没有「创建前」事件、没有 preset resolver waterfall；`session.create` 只接受请求里的 `agentPreset`，不传就用 `defaultId`（`selectedDefault ?? default`） | 监听 serial 事件 `agent/created`（创建返回前 await），此时会话仍是 blank（`lastTurn=0`、无 open turn），调用官方公开服务 `agentPresets.select(agent, presetId)` |
| 会不会和 DSH 默认预设打架 | `agentPresets.select()` 是官方给 blank 会话换预设的合法入口；官方客户端的新会话预设芯片也走同一个 Remote 方法 | 插件只调用 `select()`，从不改 `agent-preset-registry` 的 `default` / `selectedDefault`；规则关闭时完全跟随官方默认 |
| 用户手选怎么办 | 创建请求带 `agentPreset` 时会先记入 `SessionHeader` / projection；客户端不传时用官方默认 | 若会话记录的预设既不是规则值、也不是 DSH 默认值，视为用户显式选择，跳过规则 |
| 哪些会话不该动 | 子代理走 `composeFrom` 继承父级；fork 会话带 `isSeeded` / `parentSession`；开始过第一轮的会话 `select()` 会抛 `agent-preset/locked` | 过滤 `origin=subagent`、`parentSession`、`isSeeded`，并对所有 `agent/created` 做 blank 判定；异常全部吞掉，绝不让创建失败 |
| 存储 | 本插件已有唯一真源 `$DSH_HOME/preset-editor.json` | 文档版本升到 3，新增 `projectDefaults: { enabled, rules[] }`；v2 文档读入自动补默认值，读写都不会丢字段 |

> `agent/created` 是 serial 事件：监听器抛错会导致整个会话创建失败，因此实现里对读盘、目录匹配、`select()` 全部做了 try/catch，失败只记录诊断并回退官方默认。

**实机验证（2026-11-17，DSH Desktop 0.2.2-rc.3，官方默认预设设为 `minimal` 极简模式）**：用宿主官方 `sessionController.create()` 创建真实空白会话，共 11 个场景全部通过——

- 配置目录 A / B → 会话记录预设与 Agent 实际挂载组合都是规则预设（`test-alpha` / `test-beta`）；
- 未配置目录、子目录（不做父目录继承）→ 都正确回退官方默认 `minimal`；
- 在同一目录里显式手选官方 `standard` 或自定义 `pi-spider` → 以用户选择为准，诊断区记录 `skipped`；
- 路径大小写不敏感、末尾分隔符不影响匹配；
- 总开关关闭 / 单条规则停用 → 回退 `minimal`；重新启用 → 恢复规则预设；
- 全程 `officialDefaultPreset` 保持 `minimal`，插件没有改写 DSH 的默认预设配置。

另外单独复测了 **New Session 复用 live blank 会话**（宿主会把它重置回官方默认）4 组：目录 A/B 复用后会重新套回 `test-alpha`/`test-beta`，未配置目录复用保持 `minimal`。测试用的建会话入口是临时 dev 路由，测试完成后已从正式构建删除。

### 1.7.0 新增：官方预设可选 + 预设默认模型（2026-11-18）

| 需求 | 官方 0.2.2 事实 | 本版本处理 |
|---|---|---|
| 规则里能选官方内置预设 | 官方预设（standard/minimal/ptc/cordis）和本插件注册的预设在同一份 `agentPresets` 名册里；`select()` 对两者一视同仁 | 新增 `GET /dsh-preset-editor/presets` 返回完整名册（标注 `source: official \| custom`、`isDefault`、`broken`）；规则保存/预览/运行都按名册放行；下拉里用【官方】/【自定义】区分 |
| 预设绑定默认模型 / 思考强度 | 会话级模型选择是官方 `agent.model.select(selection)`（写入 `model/selection` 会话事件）；`sessionController.selectModel()` 会**顺手把全局默认模型也改掉** | 只用 `agent.model.select()`，不碰全局默认；模型目录来自 `sessionController.modelCatalog()`（DSH 已配置上游），新增 `GET /dsh-preset-editor/models` |
| 什么时候套用 | 会话没显式选过模型时才有“默认”可言 | 在预设被选中（目录规则或用户手选）且会话 blank 时套用；通过 `sessionProjections` 读 `modelSelection`，已记录过选择就跳过 |
| 模型不可用怎么办 | 上游/provider/effort 由 `llm.resolveCallConfig()` 校验 | 套用前校验，失败只记诊断并保持会话当前模型，不影响会话创建 |

**实机验证（2026-11-18，官方默认预设 `minimal`，上游含 opencode-go / cpa / deepseek-account）**：用宿主官方 `sessionController.create()` 创建真实空白会话，16 项检查全部符合预期——

- 规则目标 = 官方 `standard` → 会话记录预设与 Agent 实际组合都是 `standard`，且不套用任何模型绑定；
- 规则目标 = 自定义预设（绑定 `opencode-go/claude-haiku-5-5 + medium`）→ 预设与组合正确，会话 `modelSelection.next` 就是绑定的模型与强度；
- 第二个自定义预设（绑定 `cpa/nvidia-glm-5.3-flash + high`）同样生效，证明多上游可用；
- 未配置目录 → 官方默认 `minimal`，`modelSelection` 为空（`{lastUsed:null,next:null}`）；
- 复用 D 的 blank 会话：宿主把它重置为 `minimal` 后，兜底重新套回自定义预设，已记录的模型选择保持不变；
- 全程 `officialDefaultPreset=minimal` 未变。

测试用的临时 dev 路由已从正式 1.7.0 构建删除并重新安装验证。

**v1.8.0 补充实机验证（6/6）**：给官方预设 `minimal` 绑定 `opencode-go/claude-haiku-5-5 + medium`、给 `standard` 绑定 `cpa/nvidia-glm-5.3-flash + high` → 新建会话（默认 minimal / 显式 standard）的 `modelSelection.next` 分别与绑定一致；清除绑定后 `presetModels` 恢复为空。测试后已还原，未留下测试配置。

**v1.9.0 实机验证（18/18）**：官方预设中文名（极简/标准/PTC/Cordis 内核）正确返回；默认预设 minimal 的绑定模型自动套用 → 用户手选 standard 后模型更新为新预设默认值 → 用户再手改模型后切回 minimal，模型保持用户选择；目录规则套用自定义预设后，用户手选官方 minimal 不会被规则改回，且模型切到 minimal 的默认值；复用目录 D 的 blank 会话仍能兜底回规则预设并保持其默认模型；全程全局默认预设保持 minimal。

**v1.10.0 实机验证（15/15）**：父规则（测试文件夹 → test-model-a）自动覆盖子文件夹；子目录规则（项目C → test-model-b）就近优先；单条规则关闭「包含子文件夹」（项目D）后，其子目录回退到父规则；工作区外目录保持 minimal 且无模型绑定；以上会话的预设默认模型都正确套用；`/preset-model` 对自定义预设写回 `preset.model` 且名册返回 `boundModel`。测试后还原用户原有规则与预设。

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
- `user` / `assistant` 的请求级注入依赖 `llm/stream` waterfall「返回替换流」的能力：0.2.2 官方文档把 listener 描述为只读，并推荐改用 `agent/pre-step`，但 `agent/pre-step` 注入的消息会写进会话日志、因此会被压缩。为保住「不进日志、抗压缩」的设计，本插件仍用嵌套 `ctx.llm.stream(新请求)`（实机验证可用）；代价是每次请求多一次 adapter `prepareCall`，且新请求不携带 agent-loop 标记。若未来官方收紧该行为，需要改用 `agent/pre-step` 并接受压缩影响。
- 预设注册在插件启用期间有效；禁用本插件后，它注册的预设会一并消失。
- `system` 里不支持字面量 `{{`：DSH 目前没有转义语法，任何完整 `{{...}}` 组都会被当作变量引用。保存时校验会拦截。
- 预设一旦写了 system 文本，就会**替换**部署默认人格（`dsh-persona` 同名 section 遮蔽部署级），不会自动保留官方的 `You are a coding agent powered by ...` 行；如需保留请在 system 里自己写。
- 自定义插件行已回退：预设只挂载 `enabledTools` 对应的官方工具行，不接受任意第三方插件行。
- 运行时扩展工具列表是**只读展示**：它来自 `ctx.tools.schemas()` 的宿主全局视图，不能按预设启用；DSH 自带工具按静态名单过滤，官方新增工具时需要更新 `DSH_BUILTIN_TOOL_NAMES`。
- 预设 ID 不能与官方内置预设（`standard` / `ptc` / `minimal` / `cordis`）重名：`agentPresets.register()` 对重复 ID 直接抛错，保存/导入时会提前拦截。
- 「插件管理工具」需要宿主提供 `profileContext`（桌面 / CLI profile 都有）；纯库环境里该行会被禁用，与官方 `standard` 预设的条件一致。该工具会走 DSH 审批流程，是否放进预设由你决定（默认与官方 standard 对齐、勾选）。
- 子代理的路由字段只开在 `subagent`（spawn）实例上；`subagent_fork` 按官方约定不提供模型选择字段。
- **升级到 0.2.2 后必须先更新插件再使用**：旧版 1.4.x 在 0.2.2 下会让预设挂载失败（`tool-subagent-list-agents` 行已不存在）。本插件宿主代码在启动时加载，更新插件后需要重启 DSH NEXT（或按插件页提示重启）才会生效。
- 「按项目文件夹默认预设」只处理**空白会话**（未开始第一轮）。已经开始的会话无法中途换预设，这是 DSH 自身的约束。
- 用户手动选择优先现在是完整语义：手选任何预设（包括官方默认）都不会被目录规则改回；只有宿主在“复用 blank 会话”时做的自动重置才会被规则兜底纠正（通过包装 `sessionController.create` 识别，不依赖调用栈）。
- 官方预设的中文名只用于本插件 UI（下拉、列表、诊断）；DSH 自己右上角的预设选择器仍显示官方原名（`minimal` / `standard` 等），本插件不改官方定义。
- 目录规则默认覆盖子目录（就近规则优先）；如果希望某条规则只匹配该目录本身，取消规则上的「包含子文件夹」。相邻但名字前缀相同的目录不会误匹配。
- 主会话之外（子代理、fork、定时任务恢复的派生会话等）不会应用项目规则。
- 预设默认模型绑定只在**会话还没有显式模型选择**时生效；用户手动改过模型的会话不会被覆盖（复用 blank 会话时也一样）。
- 模型绑定按“provider + model + 可选 effort”保存，不校验模型能力细节（如上下文长度）；运行前会用官方 `llm.resolveCallConfig()` 校验一次，失败则跳过并回退会话当前模型。
- 模型绑定**不会修改 DSH 全局默认模型**；如果你希望全局默认也变，请到 DSH 设置里单独改。
- 官方内置预设的定义是只读的：本插件只能为它维护默认模型绑定（存在文档级 `presetModels`），不能改它的工具/提示词。

---

## 📦 安装

### 方式一：让 AI 一键安装（推荐 · 无需编译）

本仓库根目录已附带**编译好的安装包**：[`dsh-preset-editor-1.10.0.tgz`](./dsh-preset-editor-1.10.0.tgz)。它不需要 `pnpm install` / `pnpm run build`，直接安装即可。

把仓库拉到本地后，把下面这段提示词发给你的 AI 编程助手（Pi / Claude Code / Cursor / Windsurf / DSH 内置 Coding Agent）：

```text
请帮我把这个 DSH 插件装到当前 DSH profile：

1. 克隆仓库到本地任意目录：git clone https://github.com/Td0000000/dsh-preset-editor.git
2. 用 DSH 的 plugin_manager 工具执行 install_bundle，target 传仓库根目录里 tgz 的绝对路径，
   例如 <克隆目录>/dsh-preset-editor-1.10.0.tgz
   （install_bundle 会自动写入 profile 的 dependencies、加入 dsh.profile.bundles 并热重载，
     不需要手改 package.json / cordis.patch.yml / node_modules）
3. 看到结果里 application=applied 后重启 DSH NEXT（宿主插件代码在启动时加载），
   设置页左侧应出现【预设编辑】入口。
```

### 方式二：从源码目录安装（开发者）

```bash
# 1. 克隆到本地任意目录
git clone https://github.com/Td0000000/dsh-preset-editor.git
```

然后在 DSH 里安装该 bundle（二选一）：

- 用 DSH 的 `plugin_manager` 以 `install_bundle` 安装，`target` 传该目录的绝对路径（本仓库已提交 `lib/`，可直接安装）；
- 或在「设置 → 插件」中把该目录作为本地插件安装。

安装完成后：

- 设置页左侧出现【预设编辑】入口；
- 在【新建预设】里填写系统提示词、消息条目并勾选工具，保存后新开对话，在右上角预设选择器中选择该预设即可生效。

---

## 🗂 数据位置

- 预设存储：`$DSH_HOME/preset-editor.json`（`$DSH_HOME` 默认 `~/.dsh`）
  - `presets`：自定义预设（每个可带 `model: { provider, model, reasoningEffort? }` 默认模型绑定）
  - `presetModels`：任意预设（含官方内置）的默认模型绑定映射 `{ [presetId]: { provider, model, reasoningEffort? } }`；自定义预设自身的 `model` 优先
  - `projectDefaults`：按项目文件夹默认预设（`{ enabled, rules: [{ id, path, presetId, enabled, subfolders }] }`；`presetId` 可以是自定义预设或官方内置预设，`subfolders` 默认 true）
- 旧版遗留目录（仅一次性迁移，之后不再使用）：`$DSH_HOME/.agent-presets/`
- HTTP 接口（供 UI 与外部工具使用）：
  - `GET /dsh-preset-editor/state`（`?diagnostics=1` 附带挂载诊断；含 `presetRoster`、`projectDefaultsInfo` 与 `projectRuntime` 最近生效记录）
  - `GET /dsh-preset-editor/tools`（返回可挂载工具 + 其它插件运行时提供的工具 `runtimeTools` + 被过滤的 DSH 自带工具数量 `filteredDshCount`）
  - `GET /dsh-preset-editor/presets`（当前可选预设名册：自定义 + 官方内置，含 `source`/`isDefault`/`broken`/`boundModel`）
  - `GET /dsh-preset-editor/models`（DSH 当前已配置上游的模型目录，含 reasoning efforts）
  - `POST /dsh-preset-editor/save` / `delete` / `import`
  - `POST /dsh-preset-editor/preset-model`（保存/清除任意预设的默认模型绑定：`{ presetId, model|null }`）
  - `POST /dsh-preset-editor/projects`（保存 `projectDefaults`）
  - `GET /dsh-preset-editor/project-default?cwd=<绝对路径>`（预览某目录会命中哪条规则、最终默认预设）
  - `GET /dsh-preset-editor/export`（`?id=` 或 `?all=1`）

---

## 兼容性说明

- **框架版本**：DeepSeek Harness `0.2.2-rc.3`（DSH NEXT `2.0.22-next`；`engines.dsh: ">=0.2.2-rc.1 <0.3.0"`）。项目文件夹默认预设使用 0.2.2 的 `agent/created` serial 事件 + `agentPresets.select()`；预设默认模型使用 `agent.model.select()` + `llm.resolveCallConfig()` + `sessionController.modelCatalog()`，0.2.1 及更早版本没有这些组合。
- **微内核**：基于 `@deepseek-ai/cordis` `~4.1.0`。
- **环境要求**：使用桌面版内置 Node（`24.21`）；自行运行 Host 时 Node.js >= `24.9`。

---

## 📄 许可证

本项目沿用宽松开源协议：[MIT License](LICENSE)。
