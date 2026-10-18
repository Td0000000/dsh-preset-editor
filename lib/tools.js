// AI 工具定义与 Agent 预设插件行生成器（DSH 0.2.1-rc.2）
//
// 设计原则：
// 1. 名称/说明优先使用官方 package 自带的中文文案（各包 locale/zh.json 的
//    meta.title / meta.description）；官方没有中文文案的（如定时提醒、精准替换），
//    才由本插件补译，避免"官方有汉化我们却自己再翻一套"。
// 2. 只收录"可以安全挂进预设隔离域"的插件行；宿主级工具（pwd/cd、会话检索、
//    Ralph、团队、工作树、文件发送等）由 DSH 宿主或其它插件进程级提供，
//    列在 HOST_PROVIDED_TOOLS 里只做展示说明，绝不生成插件行，避免重复注册 /
//    服务缺失导致整个预设 broken。
// 3. 生成的行与官方内置预设（standard / cordis）保持同构；plan-mode 文案随官方同步。

const IS_WIN = process.platform === "win32";

// 与官方 dsh-web-app/presets/standard.patch.yml 的 planning 段保持同步（0.2.1-rc.2）。
export const PLAN_MODE_SECTION = [
  "You are in plan mode. Stay in plan mode until the user approves your plan through exit_plan_mode or switches the session mode. Imperative language to implement changes means plan the implementation, not execute it. A user's conversational agreement — including an answer confirming something you asked — approves nothing and does not end plan mode; fold the confirmed decision into the plan and submit it through exit_plan_mode.",
  "",
  "Explore first. Use non-mutating reads, searches, static analysis, and checks to ground the plan in the actual repository. Do not edit or write files, change configuration, run formatters or code generation that rewrites tracked files, commit, or otherwise carry out the plan. Prefer existing functions and patterns over new machinery.",
  "",
  "The tool catalog stays the same across modes for request-cache stability. These plan-mode rules override any later tool description or guidance that suggests using mutation tools; those tools remain listed to keep the tool catalog unchanged. Do not use todo_write to track this planning phase: it tracks implementation after an approved plan, while the plan itself belongs in exit_plan_mode.",
  "",
  "Resolve discoverable facts by inspection. Use ask_user_question only for user-owned choices or material ambiguity that inspection cannot answer. Do not ask the user where code lives or how current behavior works when you can find out.",
  "",
  "Make the plan decision-complete: state the goal and success criteria; group implementation changes by subsystem; identify public API, schema, and data-flow changes; cover edge cases, failure modes, tests, acceptance criteria, and explicit assumptions. Keep it concise enough to review but detailed enough that another engineer can implement it without making design decisions.",
  "",
  'When ready, call exit_plan_mode with the complete plan markdown, starting with a # title. Make exit_plan_mode the only and final tool call in that assistant response: it presents the plan for approval, and implementation begins only in a later step after approval. Do not paste the final plan as a plain reply or ask "should I proceed?" through prose or ask_user_question. If review rejects it, incorporate the feedback and present again. If the review channel is unavailable or aborted, stay in plan mode and ask the user to switch modes manually; do not proceed with implementation.',
].join("\n");

/**
 * 每个条目：id / name / category / description / defaultEnabled / rows()
 * rows() 返回可直接交给 Loader 的插件行数组（含 cordis:group 嵌套）。
 * 名称与说明尽量取自官方中文文案。
 */
export const AVAILABLE_TOOLS = [
  // ── 上下文与规则（不是"工具"，但会注入提示词/上下文） ─────────────────────
  {
    id: "time-context",
    name: "时间感知",
    category: "上下文与规则",
    description: "每一步把当前时间、浏览器时区和距上一条消息的时长告诉模型。",
    defaultEnabled: true,
    rows: () => [
      { id: "time-context", name: "@deepseek-ai/dsh-time-context" },
    ],
  },
  // ── 终端与执行 ─────────────────────────────────────────────────────────────
  {
    id: "tool-bash",
    name: "Bash 命令工具",
    category: "终端与执行",
    description: "让 AI 执行 Bash 命令，并按配置管理后台运行和权限申请。",
    defaultEnabled: true,
    rows: () => [
      { id: "tool-bash", name: "@deepseek-ai/dsh-tool-bash", disabled: IS_WIN },
    ],
  },
  {
    id: "tool-pwsh",
    name: "PowerShell 命令工具",
    category: "终端与执行",
    description: "让 AI 执行 PowerShell 命令。",
    defaultEnabled: true,
    rows: () => [
      { id: "tool-pwsh", name: "@deepseek-ai/dsh-tool-pwsh", disabled: !IS_WIN },
    ],
  },
  {
    id: "tool-jobs",
    name: "后台任务工具",
    category: "终端与执行",
    description: "让 AI 查看后台任务、读取输出或停止任务。",
    defaultEnabled: true,
    rows: () => [
      { id: "tool-jobs", name: "@deepseek-ai/dsh-tool-jobs" },
    ],
  },
  // ── 文件与工作区 ───────────────────────────────────────────────────────────
  {
    id: "tool-fs",
    name: "文件读写工具",
    category: "文件与工作区",
    description: "让 AI 读取、创建和编辑工作文件。",
    defaultEnabled: true,
    rows: () => [
      { id: "tool-fs", name: "@deepseek-ai/dsh-tool-fs" },
    ],
  },
  {
    id: "tool-fs-search",
    name: "文件搜索工具",
    category: "文件与工作区",
    description: "让 AI 按文件名或文本内容搜索本地文件。",
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
    name: "精准文本替换工具",
    category: "文件与工作区",
    description: "让 AI 对文件做精确的逐行替换，适合大文件局部修改。",
    defaultEnabled: false,
    rows: () => [
      { id: "str-replace-editor", name: "@deepseek-ai/dsh-tool-str-replace-editor" },
    ],
  },
  // ── 网络与信息 ─────────────────────────────────────────────────────────────
  {
    id: "tool-web",
    name: "网页搜索与读取工具",
    category: "网络与信息",
    description: "让 AI 搜索网页并读取页面内容。",
    defaultEnabled: true,
    rows: () => [
      {
        id: "tool-web",
        name: "@deepseek-ai/dsh-tool-web",
        config: { fetch: true, searchTimeoutMs: 60000 },
      },
    ],
  },
  // ── 交互控制 ───────────────────────────────────────────────────────────────
  {
    id: "tool-ask-user",
    name: "向用户提问工具",
    category: "交互控制",
    description: "让 AI 在需要补充信息或选择时向用户提问。",
    defaultEnabled: true,
    rows: () => [
      { id: "tool-ask-user", name: "@deepseek-ai/dsh-tool-ask-user" },
    ],
  },
  {
    id: "tool-todo",
    name: "待办清单工具",
    category: "交互控制",
    description: "让 AI 创建和更新任务待办清单。",
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
    name: "文件交付工具",
    category: "交互控制",
    description: "让 AI 将工作区文件明确标记为本轮交付内容。",
    defaultEnabled: true,
    rows: () => [
      { id: "present", name: "@deepseek-ai/dsh-tool-present" },
    ],
  },
  {
    id: "tool-goal",
    name: "目标管理（命令 + 工具）",
    category: "交互控制",
    description: "让 AI 设置、查看和更新当前会话目标，并提供 /goal 命令。",
    defaultEnabled: true,
    rows: () => [
      { id: "command-goal", name: "@deepseek-ai/dsh-command-goal" },
      { id: "tool-goal", name: "@deepseek-ai/dsh-tool-goal" },
    ],
  },
  {
    id: "plan-mode",
    name: "计划模式",
    category: "交互控制",
    description: "让 AI 先制定计划，并在用户审阅后切换到执行。",
    defaultEnabled: true,
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
  // ── 增强功能 ───────────────────────────────────────────────────────────────
  {
    id: "tool-skill",
    name: "技能系统（目录 + 加载）",
    category: "增强功能",
    description: "从本地目录发现技能，并让 AI 按需加载完整技能说明。",
    defaultEnabled: true,
    rows: () => [
      { id: "skill-filesystem", name: "@deepseek-ai/dsh-skill-filesystem" },
      { id: "tool-skill", name: "@deepseek-ai/dsh-tool-skill" },
    ],
  },
  {
    id: "tool-subagent",
    name: "子代理与工作流",
    category: "增强功能",
    description: "把任务委派给子代理，并运行 JavaScript 工作流编排多项工具操作。",
    defaultEnabled: true,
    rows: () => [
      {
        id: "delegation",
        name: "cordis:group",
        group: true,
        isolate: { workflowEngine: true },
        config: [
          { id: "tool-subagent-control", name: "@deepseek-ai/dsh-tool-subagent-control" },
          { id: "tool-subagent-list-agents", name: "@deepseek-ai/dsh-tool-subagent-control/list-agents" },
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
            config: { provider: "fork", toolName: "subagent_fork" },
          },
          { id: "workflow-ptc", name: "@deepseek-ai/dsh-workflow-ptc", config: { provider: "spawn" } },
          { id: "tool-workflow", name: "@deepseek-ai/dsh-tool-workflow" },
        ],
      },
    ],
  },
  {
    id: "tool-cordis",
    name: "插件 API 查询工具",
    category: "增强功能",
    description: "让 AI 在开发插件前查询服务端和浏览器端的可用 API（依赖宿主 Inspect 提供者，桌面 / Web 可用）。",
    defaultEnabled: false,
    rows: () => [
      { id: "tool-cordis", name: "@deepseek-ai/dsh-tool-cordis" },
    ],
  },
  // ── 定时与上下文优化 ───────────────────────────────────────────────────────
  {
    id: "tool-schedule",
    name: "定时提醒工具",
    category: "上下文优化",
    description: "让 AI 创建、查看和取消定时提醒，到点后在原会话继续任务。",
    defaultEnabled: true,
    rows: () => [
      { id: "tool-schedule", name: "@deepseek-ai/dsh-tool-schedule" },
    ],
  },
  {
    id: "compaction",
    name: "上下文自动压缩",
    category: "上下文优化",
    description: "到达上下文阈值时总结历史，并精简过长的工具输出。",
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

/**
 * 宿主级 / 不可放进预设的工具与插件。
 *
 * 这些能力由 DSH 宿主、profile bundle 或其它插件在进程级或按 agent 直接提供；
 * 在自定义预设里再挂一次轻则重复注册、重则服务缺失导致整个预设 broken，
 * 所以本编辑器只在「AI 工具」弹窗里说明，绝不生成插件行。
 */
export const HOST_PROVIDED_TOOLS = [
  {
    id: "tool-working-directory",
    name: "工作目录工具（pwd / cd）",
    reason: "由 DSH 宿主行提供；工作目录同时会作为运行时上下文自动注入。",
  },
  {
    id: "tool-workspace-dependencies",
    name: "工作区依赖查询",
    reason: "由宿主的工具包在进程级提供。",
  },
  {
    id: "tool-session-query",
    name: "会话检索工具",
    reason: "由 experimental-session-search bundle 在宿主侧挂载。",
  },
  {
    id: "tool-ralph",
    name: "Ralph 迭代工具",
    reason: "由 experimental-ralph-bundle 在宿主侧挂载，预设里重复挂载会冲突。",
  },
  {
    id: "tool-terminal",
    name: "持久终端 / 持久 Shell",
    reason: "属于官方 minimal 预设的专用组合，需要配套终端服务；普通预设请用 Bash/PowerShell。",
  },
  {
    id: "experimental-tool-worktree",
    name: "工作树工具",
    reason: "由 experimental-tool-worktree bundle 在宿主侧挂载。",
  },
  {
    id: "experimental-tool-agent-team",
    name: "团队工具",
    reason: "由 Agent Teams profile 按 agent 注入；预设重复挂载会与宿主工具冲突。",
  },
  {
    id: "dsh-im",
    name: "文件发送工具（dsh_im_return_file）",
    reason: "由 dsh-im 插件在宿主侧注册，预设不能重复挂载。",
  },
  {
    id: "plugin-manager-tools",
    name: "插件管理 / 插件市场工具",
    reason: "官方内置预设里也是 disabled 行，属于宿主管理面。",
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
      (id) => typeof id === "string",
    ),
  );
  const rows = [];
  for (const tool of AVAILABLE_TOOLS) {
    if (!ids.has(tool.id)) continue;
    rows.push(...tool.rows());
  }
  return rows;
}
