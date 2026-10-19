// AI 工具定义与 Agent 预设插件行生成器（DSH 0.2.1-rc.2）
//
// 设计原则：
// 1. 名称/说明优先使用官方 package 自带的中文文案（各包 locale/zh.json 的
//    meta.title / meta.description）；官方没有中文文案的（如定时提醒、精准替换），
//    才由本插件补译，避免"官方有汉化我们却自己再翻一套"。
// 2. 只收录"可以安全挂进预设隔离域"的插件行；宿主级工具（pwd/cd、会话检索、
//    Ralph、团队、工作树、文件发送等）由 DSH 宿主或其它插件进程级提供，绝不生成
//    插件行，避免重复注册 / 服务缺失导致整个预设 broken。
// 3. 运行时由其它插件提供的 AI 可调用工具，由 filterRuntimeTools() 过滤出
//    “非 DSH 自带工具”，在「AI 工具」弹窗最下方只读展示。
// 4. 生成的行与官方内置预设（standard / cordis）保持同构；plan-mode 文案随官方同步。

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
 * DSH 自带工具名。
 *
 * 用途：把运行时注册表里“DSH 官方插件注册的工具”过滤掉，只把其它插件
 * （dsh-im、用户自装插件、MCP 等）提供的 AI 可调用工具展示在工具选择最下方。
 *
 * 这些名字来自官方 dsh-tool-* / experimental-* 包；新增官方工具时需要补这里。
 */
export const DSH_BUILTIN_TOOL_NAMES = new Set([
  "ask_user_question",
  "bash",
  "cordis_inspect_list",
  "cordis_inspect_query",
  "create_goal",
  "create_worktree",
  "edit",
  "exit_plan_mode",
  "get_goal",
  "glob",
  "grep",
  "interrupt_agent",
  "job_kill",
  "job_list",
  "job_output",
  "list_agents",
  "list_mcp_resource_templates",
  "list_mcp_resources",
  "list_subagent_models",
  "load_workspace_dependencies",
  "present",
  "pwsh",
  "ralph",
  "read",
  "read_image",
  "read_mcp_resource",
  "run_code",
  "schedule_create",
  "schedule_delete",
  "schedule_list",
  "schedule_update",
  "send_message",
  "session_event_read",
  "session_event_search",
  "session_event_trace",
  "session_search",
  "session_trace",
  "skill",
  "spawn_teammate",
  "str_replace_editor",
  "subagent",
  "subagent_fork",
  "team_task_create",
  "team_task_get",
  "team_task_list",
  "team_task_update",
  "terminal_close",
  "terminal_list",
  "terminal_open",
  "terminal_read",
  "terminal_send",
  "terminal_signal",
  "todo_write",
  "update_goal",
  "wait_agent",
  "web_fetch",
  "web_search",
  "working_directory",
  "workflow",
  "write",
]);

/**
 * 从 `ctx.tools.schemas()` 的结果里筛出“其它插件提供的工具”。
 *
 * 说明：运行时 schemas 不携带来源包名，所以用官方工具名清单做反向过滤：
 * 在清单里的视为 DSH 自带（隐藏），不在清单里的视为其它插件提供（展示）。
 */
export function filterRuntimeTools(schemas) {
  const seen = new Set();
  const list = [];
  for (const schema of Array.isArray(schemas) ? schemas : []) {
    const name = typeof schema?.name === "string" ? schema.name.trim() : "";
    if (!name || seen.has(name)) continue;
    seen.add(name);
    if (DSH_BUILTIN_TOOL_NAMES.has(name)) continue;
    list.push({
      name,
      description: typeof schema?.description === "string" ? schema.description : "",
    });
  }
  list.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return list;
}

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
