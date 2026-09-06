// AI 工具定义与 agent.cordis.yml 生成器
// 包含官方所有内置工具及说明，支持动态与自定义组合

export const AVAILABLE_TOOLS = [
  {
    id: "tool-bash",
    name: "Bash Shell",
    category: "终端与执行",
    description: "执行 Linux/macOS Shell 命令（受沙箱策略保护）",
    defaultEnabled: true,
    yamlRows: (platform) => [
      "- id: tool-bash",
      "  name: '@deepseek-ai/dsh-tool-bash'",
      "  disabled: !!js process.platform === 'win32'",
    ],
  },
  {
    id: "tool-pwsh",
    name: "PowerShell",
    category: "终端与执行",
    description: "执行 Windows PowerShell 命令（原生 Windows 环境）",
    defaultEnabled: true,
    yamlRows: (platform) => [
      "- id: tool-pwsh",
      "  name: '@deepseek-ai/dsh-tool-pwsh'",
      "  disabled: !!js process.platform !== 'win32'",
    ],
  },
  {
    id: "tool-fs",
    name: "文件操作 (Filesystem)",
    category: "文件与工作区",
    description: "读写、创建、列出工作区中的文件",
    defaultEnabled: true,
    yamlRows: () => [
      "- id: tool-fs",
      "  name: '@deepseek-ai/dsh-tool-fs'",
    ],
  },
  {
    id: "tool-fs-search",
    name: "文件搜索 (Grep/Glob)",
    category: "文件与工作区",
    description: "在工作区内按文本内容 (grep) 或文件名模式 (glob) 检索",
    defaultEnabled: true,
    yamlRows: () => [
      "- id: tool-fs-search",
      "  name: '@deepseek-ai/dsh-tool-fs-search'",
      "  config:",
      "    sampleOverCapGlobResults: false",
    ],
  },
  {
    id: "tool-str-replace-editor",
    name: "精准文本替换编辑器",
    category: "文件与工作区",
    description: "针对大文件进行精准行内容替换，节省上下文",
    defaultEnabled: true,
    yamlRows: () => [
      "- id: str-replace-editor",
      "  name: '@deepseek-ai/dsh-tool-str-replace-editor'",
      "  config:",
      "    maxOutputChars: 16000",
    ],
  },
  {
    id: "tool-jobs",
    name: "后台任务 (Jobs)",
    category: "终端与执行",
    description: "管理长时间运行的后台进程、查看日志与结束任务",
    defaultEnabled: true,
    yamlRows: () => [
      "- id: tool-jobs",
      "  name: '@deepseek-ai/dsh-tool-jobs'",
    ],
  },
  {
    id: "tool-web",
    name: "网页浏览与检索 (Web)",
    category: "网络与信息",
    description: "抓取网页内容与使用搜索引擎搜索网络信息",
    defaultEnabled: true,
    yamlRows: () => [
      "- id: tool-web",
      "  name: '@deepseek-ai/dsh-tool-web'",
      "  config:",
      "    fetch: true",
      "    searchTimeoutMs: 60000",
    ],
  },
  {
    id: "tool-skill",
    name: "技能系统 (Skills)",
    category: "增强功能",
    description: "加载和执行项目与本地自定义 Skill 技能包",
    defaultEnabled: true,
    yamlRows: () => [
      "- id: skill-filesystem",
      "  name: '@deepseek-ai/dsh-skill-filesystem'",
      "- id: tool-skill",
      "  name: '@deepseek-ai/dsh-tool-skill'",
    ],
  },
  {
    id: "tool-ask-user",
    name: "向用户提问 (Ask User)",
    category: "交互控制",
    description: "向用户提出确认或澄清问题，等待用户输入回答",
    defaultEnabled: true,
    yamlRows: () => [
      "- id: tool-ask-user",
      "  name: '@deepseek-ai/dsh-tool-ask-user'",
    ],
  },
  {
    id: "tool-todo",
    name: "待办清单 (Todo)",
    category: "交互控制",
    description: "记录和追踪多步骤任务清单状态",
    defaultEnabled: true,
    yamlRows: () => [
      "- id: tool-todo",
      "  name: '@deepseek-ai/dsh-tool-todo'",
      "  config:",
      "    allowParallelInProgress: true",
    ],
  },
  {
    id: "tool-goal",
    name: "目标管理 (Goal)",
    category: "交互控制",
    description: "多轮任务驱动与目标对齐控制",
    defaultEnabled: false,
    yamlRows: () => [
      "- id: command-goal",
      "  name: '@deepseek-ai/dsh-command-goal'",
      "- id: tool-goal",
      "  name: '@deepseek-ai/dsh-tool-goal'",
    ],
  },
  {
    id: "tool-subagent",
    name: "子代理 (Subagents)",
    category: "增强功能",
    description: "派生子会话独立执行子任务 (spawn / fork)",
    defaultEnabled: false,
    yamlRows: () => [
      "- id: delegation",
      "  name: cordis:group",
      "  group: true",
      "  isolate:",
      "    workflowEngine: true",
      "  config:",
      "    - id: tool-subagent-control",
      "      name: '@deepseek-ai/dsh-tool-subagent-control'",
      "    - id: tool-subagent-list-agents",
      "      name: '@deepseek-ai/dsh-tool-subagent-control/list-agents'",
      "    - id: tool-subagent",
      "      name: '@deepseek-ai/dsh-tool-subagent'",
      "      config:",
      "        provider: spawn",
      "        toolName: subagent",
      "        modelSelectionSettings: true",
      "        backgroundMode: continuable",
      "    - id: tool-subagent-fork",
      "      name: '@deepseek-ai/dsh-tool-subagent'",
      "      config:",
      "        provider: fork",
      "        toolName: subagent_fork",
      "        backgroundMode: continuable",
    ],
  },
  {
    id: "tool-cordis",
    name: "Cordis 探针工具",
    category: "系统诊断",
    description: "检查和诊断当前会话的 Cordis 服务与插件树状态",
    defaultEnabled: false,
    yamlRows: () => [
      "- id: tool-cordis",
      "  name: '@deepseek-ai/dsh-tool-cordis'",
    ],
  },
  {
    id: "tool-workflow",
    name: "工作流线程 (Workflow)",
    category: "增强功能",
    description: "在独立 Worker 线程中执行工作流",
    defaultEnabled: false,
    yamlRows: () => [
      "- id: workflow-worker-thread",
      "  name: '@deepseek-ai/dsh-workflow-worker-thread'",
      "  config:",
      "    provider: spawn",
      "- id: tool-workflow",
      "  name: '@deepseek-ai/dsh-tool-workflow'",
    ],
  },
  {
    id: "compaction",
    name: "上下文自动压缩 (Compaction)",
    category: "上下文优化",
    description: "长对话时自动剪枝和压缩超长工具输出与历史消息",
    defaultEnabled: true,
    yamlRows: () => [
      "- id: compaction",
      "  name: cordis:group",
      "  group: true",
      "  isolate:",
      "    compaction: true",
      "    toolResultPruner: true",
      "  config:",
      "    - id: compaction-basic",
      "      name: '@deepseek-ai/dsh-compaction-basic'",
      "    - id: command-compact",
      "      name: '@deepseek-ai/dsh-command-compact'",
      "    - id: tool-result-pruner",
      "      name: '@deepseek-ai/dsh-compaction-tool-result-pruner'",
      "      config:",
      "        thresholdChars: 8192",
      "        headChars: 4096",
      "        tailChars: 1024",
    ],
  },
];

export function getDefaultToolIds() {
  return AVAILABLE_TOOLS.filter((t) => t.defaultEnabled).map((t) => t.id);
}

/**
 * 根据勾选的工具列表生成完整的 agent.cordis.yml 内容
 */
export function generateCordisYaml(enabledToolIds) {
  const ids = new Set(Array.isArray(enabledToolIds) ? enabledToolIds : getDefaultToolIds());
  const lines = [
    "# 由 dsh-preset-editor 自动生成的自定义预设 Cordis 组合文件",
    "# 符合官方 DSH Agent Preset 规范",
    "",
    "- id: persona",
    "  name: '@deepseek-ai/dsh-persona'",
    "  config:",
    "    text: >-",
    "      You are a helpful coding assistant.",
    "",
    "- id: agent-instructions",
    "  name: '@deepseek-ai/dsh-agent-instructions'",
    "  config:",
    "    maxBytes: 65536",
    "",
  ];

  for (const tool of AVAILABLE_TOOLS) {
    if (ids.has(tool.id)) {
      lines.push(`# ── ${tool.name} ──────────────────────────────────`);
      const rows = tool.yamlRows();
      lines.push(...rows);
      lines.push("");
    }
  }

  return lines.join("\n");
}
