<div align="center">

# dsh-preset-editor（预设编辑）

### DeepSeek Harness 官方自定义预设可视化编辑插件

可视化编辑、管理与编排自定义 Agent 预设，完全融入官方预设体系，多消息类型自由调序，AI 工具自由配备，开箱即用自动注入。

<p>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-4b8f77" alt="MIT License"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white" alt="Node.js 18+"></a>
  <a href="https://github.com/Td0000000/dsh-preset-editor"><img src="https://img.shields.io/badge/DSH-0.1.x-blue" alt="DSH 0.1.x"></a>
</p>

</div>

---

## 💖 致谢与项目溯源（Credits & Origin）

本项目灵感与核心注入理念源自原开源项目 **[dsh-preset-plus](https://github.com/Rain-kl/dsh-preset-plus)**（原作者：**[Rain-kl](https://github.com/Rain-kl)**）。

原项目参考了酒馆（SillyTavern）的提示词编排思想，在 DSH 框架下创新性地实现了基于伪装上下文（`[system] → [user] → [assistant]`）的多条目注入机制。在此向原作者 **Rain-kl** 致以由衷的敬意与感谢！

> **说明**：本项目在原项目优秀的上下文前置注入思想的基础上，进行了**深度的魔改、架构重构与官方适配性修改**，旨在让预设编辑完全融入 DeepSeek Harness 官方的 Agent Presets 原生体系，消除命令操作感，提供更优雅的双向同步与工具配备体验。

---

## 🔄 相比原项目的重构与魔改升级

| 功能维度 | 原参考项目 (`dsh-preset-plus`) | 本重构项目 (`dsh-preset-editor`) |
| :--- | :--- | :--- |
| **触发与运行机制** | 依赖固定模式 `preset-plus`，支持 `/preset-plus`、`/prefill` 等 slash 命令 | **彻底移除所有 `/` 命令**；纯粹基于会话绑定的预设自动触发注入，无命令感 |
| **官方预设兼容性** | 仅作为一个名为 `preset-plus` 的单一模式运行，无法在官方预设列表中以多个独立预设展示 | **每个预设都是合法的官方自定义预设**；生成标准的 `preset.yml` 与 `agent.cordis.yml`，直达官方选择器与设置项 |
| **文件存储与同步** | 集中依赖全局 JSON 文件；在官方删除预设后无法实时同步 | **文件夹即预设（Folder-as-Preset）**；以物理文件系统为唯一真源，官方删除实时同步消除，官方复制自动吸纳 |
| **AI 工具配备** | 固定跟随包内写死的模式工具配置 | **全套 AI 工具自选配备**；支持自由勾选官方全套工具（Bash、PowerShell、文件、检索、Web、技能、任务等） |
| **隔离域架构安全** | 未按官方细分隔离组，容易发生服务碰撞 | **严格遵循官方 `editing-cordis-compositions` 创作规范**，自动包裹 `workflowEngine`、`compaction`、`planMode` 隔离域 |
| **消息类型与约束** | 传统角色描述；顶部规则松散 | **标准化使用 `system` / `user` / `assistant` 纯英文标准字段**；严格约束顶级首条必须为启用的 `system` |
| **UI 交互排版** | 纵向折叠卡片，带有模式开关与命令提示 | **全新四大横向导航入口**：`当前预设`、`+ 新建预设`、`导入预设`、`{{}} 变量说明`，视觉与官方主题无缝契合 |
| **模板变量解析** | 未提示变量解析范围与错误边界 | **内置完整的官方 3 大模板变量（`{{model}}`、`{{provider}}`、`{{cwd}}`）使用规范与非法位置拦截提示** |

---

## 🌟 核心特性

1. **完全符合官方自定义预设规范**
   - 建立的每一个预设均直接在 `<dshHome>/.agent-presets/<id>/` 写入标准的 `preset.yml` 与 `agent.cordis.yml`。
   - 无缝呈现在官方设置的【自定义预设】以及聊天界面右上角的【Agent 预设选择器】中。
2. **纯粹的预设绑定触发（零命令、无感自动注入）**
   - 彻底移除了任何 `/` 前缀命令。
   - 只要在新建聊天时选择了对应的自定义预设，系统便会在启动会话与模型流式生成时默认自动注入该预设的提示词与上下文消息。
   - **精确隔离**：只对自己编辑绑定的自定义预设生效，官方内置预设（standard、minimal、ptc、cordis 等）保持纯净，绝不受任何影响。
3. **文件夹即预设（全平台唯一真源双向同步）**
   - 无论在 Windows、macOS、Linux 还是 Docker 容器中，均以物理预设文件夹为唯一真源。
   - **官方删除实时同步**：在官方设置中删除自定义预设时，由于物理文件夹被移除，本插件页面一键刷新即刻同步消除，绝不残留或回滚复活。
   - **官方复制自动纳管**：在官方界面通过“复制”新建的预设目录，本插件能自动发现并纳管。
4. **可视化消息编排与顶级强约束**
   - 标准采用开发级英文角色字段：`system`、`user`、`assistant`（不带任何冗余括号与中文干扰）。
   - **顶级强约束**：预设首条（`#1`）强制固定为启用的 `system` 消息，不可关闭、不可删除、不可移出首位，确保系统提示词基石稳固。
   - 支持通过 **`↑ 上移`** / **`↓ 下移`** 按钮自由调整消息在上下文中的排列位置与执行顺序。
   - 每条条目支持独立启用/停用开关、实时内容修改与删除。
5. **AI 工具自由配备**
   - 点击【AI 工具】按钮，展示当前预设需要配备的所有工具（涵盖官方所有内置工具：Bash、PowerShell、文件操作、文件检索、替换编辑器、后台任务、网页检索、技能系统、询问用户、Todo 待办、子代理、工作流等）。
   - 严格遵循官方创作隔离域规则（`isolate: workflowEngine` / `compaction` 等），杜绝跨平面服务注册冲突。
6. **官方 `{{}}` 模板变量规范与说明**
   - 界面内置专属的【`{{}}` 变量说明】入口，详细解析官方支持的 3 大模板变量：
     - `{{model}}`：当前会话所分配的具体大模型名称；
     - `{{provider}}`：当前模型服务提供商标识；
     - `{{cwd}}`：当前会话工作区根目录绝对路径；
   - **安全警示**：模板变量由 DSH 核心装配引擎解析，仅支持在 `system` 中使用；若写入 `user` 或 `assistant` 会导致无法解析或报错。
7. **清晰规范的三大页面视图**
   - 顶部醒目大字：**预设编辑**，配以小字介绍：*可视化编辑预设，选择一个预设并保存，新对话即可生效。*
   - 横向排版三大导航入口：
     - **当前预设**：卡片式浏览已创建的自定义预设，快捷进行编辑、导出、删除。
     - **新建预设**：定制新预设，配备工具与消息条目，操作仅有“保存预设”与“取消”。
     - **导入预设**：点击直接调起文件选择器，一键导入已有的预设 JSON 文件。
     - **{{}} 变量说明**：弹窗展示官方模板变量规则与使用范例。
     - **编辑预设**：支持对已存在的预设修改内容、配备工具、支持“保存”、“取消”、“删除预设”与“导出预设”。

---

## 🤖 让 AI 帮您一键安装（Copilot 提示词）

如果您使用的是支持代码辅助的 AI Agent（如 Claude Code、小鲸鱼-Pi、Cursor 等），可以直接复制以下提示词给 AI：

```text
请帮我把 https://github.com/Td0000000/dsh-preset-editor 克隆到本地 plugins/dsh-preset-editor 目录，并将其作为 link 插件添加到当前 DSH 的 web profile 中：
1. git clone https://github.com/Td0000000/dsh-preset-editor.git plugins/dsh-preset-editor
2. ./dshw plugin --profile web add link:./plugins/dsh-preset-editor
3. 检查并重启 DSH Web 服务
```

---

## 📦 手动安装方式

在已配置好 DSH 环境的终端中运行：

```bash
# 1. 克隆本仓库到 plugins 目录
git clone https://github.com/Td0000000/dsh-preset-editor.git plugins/dsh-preset-editor

# 2. 将插件以 link 方式装载至当前 profile
dsh plugin --profile web add link:./plugins/dsh-preset-editor

# 3. 重启 DSH Web 服务
./dshw start
```

打开设置页面，在左侧导航栏点击【预设编辑】，即可开始管理与创建自定义预设。

---

## 兼容性说明

- **框架版本**：DeepSeek Harness 官方版本 `0.1.x`（包括 `0.1.2-rc.1` 及以上主干版本）。
- **微内核**：基于 `@deepseek-ai/cordis` `^4.0.1`。
- **环境要求**：Node.js >= 18.0.0。

---

## 📄 许可证

本项目沿用原项目的宽松开源协议：[MIT License](LICENSE)。
