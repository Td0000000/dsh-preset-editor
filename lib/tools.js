// AI 工具定义与 Agent 预设插件行生成器
//
// DSH 0.2 起，自定义预设不再是 $DSH_HOME/.agent-presets/<id>/ 目录：
// 预设是 `@deepseek-ai/dsh-agent-preset` 的一条声明，声明的 `plugins` 字段
// 就是该预设挂载的 Cordis 插件行列表。
//
// 因此这里不再生成 YAML 文本，而是生成与官方 dsh-web-app/presets/standard.patch.yml
// 完全同构的插件行对象；由 core.js 组装成预设声明后交给 agentPresets.register() 挂载。

const IS_WIN = process.platform === "win32";

// 与官方 standard 预设保持一致的 plan mode 提示词
const PLAN_MODE_SECTION = [
  "You are in plan mode. Stay in plan mode until exit_plan_mode succeeds or the user switches the session mode. Imperative language to implement changes means plan the implementation, not execute it. A user's conversational agreement — including an answer confirming something you asked — approves nothing and does not end plan mode; fold the confirmed decision into the plan and submit it through exit_plan_mode.",
  "",
  "Explore first. Use non-mutating reads, searches, static analysis, and checks to ground the plan in the actual repository. Do not edit or write files, change configuration, run formatters or code generation that rewrites tracked files, commit, or otherwise carry out the plan. Prefer existing functions and patterns over new machinery.",
  "",
  "The tool catalog stays the same across modes for request-cache stability. These plan-mode rules override any later tool description or guidance that suggests using mutation tools; those tools remain listed to keep the tool catalog unchanged. Do not use todo_write to track this planning phase: it tracks implementation after an approved plan, while the plan itself belongs in exit_plan_mode.",
  "",
  "Resolve discoverable facts by inspection. Use ask_user_question only for user-owned choices or material ambiguity that inspection cannot answer. Do not ask the user where code lives or how current behavior works when you can find out.",
  "",
  "Make the plan decision-complete: state the goal and success criteria; group implementation changes by subsystem; identify public API, schema, and data-flow changes; cover edge cases, failure modes, tests, acceptance criteria, and explicit assumptions. Keep it concise enough to review but detailed enough that another engineer can implement it without making design decisions.",
  "",
  "When ready, call exit_plan_mode with the complete plan markdown, starting with a # title. Make exit_plan_mode the only and final tool call in that assistant response: it presents the plan for approval, and implementation begins only in a later step after approval. Do not paste the final plan as a plain reply or ask \"should I proceed?\" through prose or ask_user_question. If review rejects it, incorporate the feedback and present again. If the review channel is unavailable or aborted, stay in plan mode and ask the user to switch modes manually; do not proceed with implementation.",
].join("\n");

/**
 * 每个条目：id / name / category / description / defaultEnabled / rows()
 * rows() 返回可直接交给 Loader 的插件行数组（含 cordis:group 嵌套）。
 */
export const AVAILABLE_TOOLS = [
  {
    id: "tool-bash",
    name: "Bash Shell",
    category: "终端与执行",
    description: "执行 Linux/macOS Shell 命令（受沙箱策略保护）",
    defaultEnabled: true,
    rows: () => [
      { id: "tool-bash", name: "@deepseek-ai/dsh-tool-bash", disabled: IS_WIN },
    ],
  },
  {
    id: "tool-pwsh",
    name: "PowerShell",
    category: "终端与执行",
    description: "执行 Windows PowerShell 命令（原生 Windows 环境）",
    defaultEnabled: true,
    rows: () => [
      { id: "tool-pwsh", name: "@deepseek-ai/dsh-tool-pwsh", disabled: !IS_WIN },
    ],
  },
  {
    id: "tool-fs",
    name: "文件操作 (Filesystem)",
    category: "文件与工作区",
    description: "读取、写入、编辑工作区文件，查看目录结构",
    defaultEnabled: true,
    rows: () => [
      { id: "tool-fs", name: "@deepseek-ai/dsh-tool-fs" },
    ],
  },
  {
    id: "tool-fs-search",
    name: "文件搜索 (Grep/Glob)",
    category: "文件与工作区",
    description: "在工作区内按文本内容 (grep) 或文件名模式 (glob) 检索",
    defaultEnabled: true,
    rows: () => [
      {
        id: "tool-fs-search",
        name: "@deepseek-ai/dsh-tool-fs-search",
        config: { sampleOverCapGlobResults: false },
      },
    ],
  },
  {
    id: "tool-str-replace-editor",
    name: "精准文本替换编辑器",
    category: "文件与工作区",
    description: "针对大文件进行精准行内容替换，节省上下文",
    defaultEnabled: true,
    rows: () => [
      { id: "str-replace-editor", name: "@deepseek-ai/dsh-tool-str-replace-editor" },
    ],
  },
  {
    id: "tool-jobs",
    name: "后台任务 (Jobs)",
    category: "终端与执行",
    description: "管理长时间运行的后台进程、查看日志与结束任务",
    defaultEnabled: true,
    rows: () => [
      { id: "tool-jobs", name: "@deepseek-ai/dsh-tool-jobs" },
    ],
  },
  {
    id: "tool-web",
    name: "网页浏览与检索 (Web)",
    category: "网络与信息",
    description: "抓取网页内容与使用搜索引擎搜索网络信息",
    defaultEnabled: true,
    rows: () => [
      {
        id: "tool-web",
        name: "@deepseek-ai/dsh-tool-web",
        config: { fetch: true, searchTimeoutMs: 60000 },
      },
    ],
  },
  {
    id: "tool-skill",
    name: "技能系统 (Skills)",
    category: "增强功能",
    description: "加载和执行项目与本地自定义 Skill 技能包",
    defaultEnabled: true,
    rows: () => [
      { id: "skill-filesystem", name: "@deepseek-ai/dsh-skill-filesystem" },
      { id: "tool-skill", name: "@deepseek-ai/dsh-tool-skill" },
    ],
  },
  {
    id: "tool-ask-user",
    name: "向用户提问 (Ask User)",
    category: "交互控制",
    description: "向用户提出确认或澄清问题，等待用户输入回答",
    defaultEnabled: true,
    rows: () => [
      { id: "tool-ask-user", name: "@deepseek-ai/dsh-tool-ask-user" },
    ],
  },
  {
    id: "tool-todo",
    name: "待办清单 (Todo)",
    category: "交互控制",
    description: "记录和追踪多步骤任务清单状态",
    defaultEnabled: true,
    rows: () => [
      {
        id: "tool-todo",
        name: "@deepseek-ai/dsh-tool-todo",
        config: { allowParallelInProgress: true },
      },
    ],
  },
  {
    id: "tool-present",
    name: "交付物卡片 (Present)",
    category: "交互控制",
    description: "把文件、图片、文档作为可打开的交付物卡片展示给用户",
    defaultEnabled: true,
    rows: () => [
      { id: "present", name: "@deepseek-ai/dsh-tool-present" },
    ],
  },
  {
    id: "tool-goal",
    name: "目标管理 (Goal)",
    category: "交互控制",
    description: "多轮任务驱动与目标对齐控制",
    defaultEnabled: false,
    rows: () => [
      { id: "command-goal", name: "@deepseek-ai/dsh-command-goal" },
      { id: "tool-goal", name: "@deepseek-ai/dsh-tool-goal" },
    ],
  },
  {
    id: "plan-mode",
    name: "计划模式 (Plan Mode)",
    category: "交互控制",
    description: "先分析推演生成架构方案，审批确认后再动手实现",
    defaultEnabled: false,
    rows: () => [
      {
        id: "planning",
        name: "cordis:group",
        group: true,
        isolate: { planMode: true },
        config: [
          {
            id: "plan-mode",
            name: "@deepseek-ai/dsh-plan-mode",
            config: { section: PLAN_MODE_SECTION },
          },
        ],
      },
    ],
  },
  {
    id: "tool-subagent",
    name: "子代理 (Subagents)",
    category: "增强功能",
    description: "派生子会话独立执行子任务 (spawn / fork) 与工作流编排",
    defaultEnabled: false,
    rows: () => [
      {
        id: "delegation",
        name: "cordis:group",
        group: true,
        isolate: { workflowEngine: true },
        config: [
          { id: "tool-subagent-control", name: "@deepseek-ai/dsh-tool-subagent-control" },
          { id: "tool-subagent-list-agents", name: "@deepseek-ai/dsh-tool-subagent-control/list-agents" },
          // DSH 0.2.1 起官方删除了 tool-subagent 的 backgroundMode 配置项：
          // 所有调用都统一为「建立子代理后立即返回 started subagent <id> + 完成通知」
          // （官方 README: Every call returns started subagent <childId> ... It does not wait），
          // 后台/续聊语义由运行时内建，工具行只需 provider / toolName / modelSelectionSettings。
          {
            id: "tool-subagent",
            name: "@deepseek-ai/dsh-tool-subagent",
            config: {
              provider: "spawn",
              toolName: "subagent",
              modelSelectionSettings: true,
            },
          },
          {
            id: "tool-subagent-fork",
            name: "@deepseek-ai/dsh-tool-subagent",
            config: {
              provider: "fork",
              toolName: "subagent_fork",
            },
          },
          { id: "workflow-ptc", name: "@deepseek-ai/dsh-workflow-ptc", config: { provider: "spawn" } },
          { id: "tool-workflow", name: "@deepseek-ai/dsh-tool-workflow" },
          {
            id: "tool-ralph",
            name: "@deepseek-ai/dsh-tool-ralph",
            disabled: true,
            config: { subagentProvider: "spawn", maxRounds: 64 },
          },
        ],
      },
    ],
  },
  {
    id: "compaction",
    name: "上下文自动压缩 (Compaction)",
    category: "上下文优化",
    description: "长对话时自动剪枝和压缩超长工具输出与历史消息",
    defaultEnabled: true,
    rows: () => [
      {
        id: "compaction",
        name: "cordis:group",
        group: true,
        isolate: { compaction: true, toolResultPruner: true },
        config: [
          { id: "compaction-basic", name: "@deepseek-ai/dsh-compaction-basic" },
          { id: "command-compact", name: "@deepseek-ai/dsh-command-compact" },
          {
            id: "tool-result-pruner",
            name: "@deepseek-ai/dsh-compaction-tool-result-pruner",
            config: { thresholdChars: 8192, headChars: 4096, tailChars: 1024 },
          },
        ],
      },
    ],
  },
];

export function getDefaultToolIds() {
  return AVAILABLE_TOOLS.filter((t) => t.defaultEnabled).map((t) => t.id);
}

/**
 * 根据勾选的工具 id 列表生成预设的 Cordis 插件行数组。
 * 与旧版不同：这里返回的是对象行，不是 YAML 文本。
 */
export function buildToolRows(enabledToolIds) {
  const ids = new Set(
    (Array.isArray(enabledToolIds) ? enabledToolIds : getDefaultToolIds()).filter(
      (id) => typeof id === "string" && id !== "tool-cordis",
    ),
  );
  const rows = [];
  for (const tool of AVAILABLE_TOOLS) {
    if (!ids.has(tool.id)) continue;
    rows.push(...tool.rows());
  }
  return rows;
}
