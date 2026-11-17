// dsh-preset-editor 前端 UI 客户端插件
// 无需编译构建，纯原生 React + CSS 变量实现，原生适配 DSH 主题

window.__ModuleLoader__.load({
  id: "dsh-preset-editor",
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const react = require("react");
    const h = react.createElement;
    const { useState, useEffect, useCallback, useRef } = react;

    const name = "dsh-preset-editor";
    const inject = ["slots"];
    // 供「项目目录选择」等可选客户端服务使用；在 apply(ctx) 时绑定。
    let clientCtx = null;
    // 可选：官方 uiWorkspace 服务（原生目录选择器）。桌面端存在，纯库环境可能没有。
    let directoryPicker = null;

    // 样式规范与主题变量
    const THEME = {
      ink: "var(--dsw-alias-label-primary, #e5e7eb)",
      muted: "var(--dsw-alias-label-tertiary, #9ca3af)",
      dim: "var(--dsw-alias-label-dimmed, #6b7280)",
      border: "var(--dsw-alias-border-l2, rgba(128,128,128,.22))",
      borderLight: "var(--dsw-alias-border-l1, rgba(128,128,128,.12))",
      panel: "var(--dsw-alias-bg-layer-3, rgba(255,255,255,.035))",
      panelHover: "var(--dsw-alias-bg-layer-2, rgba(255,255,255,.065))",
      panelActive: "var(--dsw-alias-bg-layer-1, rgba(255,255,255,.095))",
      accent: "var(--dsw-alias-brand-primary, #3b82f6)",
      // 注意：--dsw-alias-brand-primary 是「反色前景色」（浅色主题近黑、深色主题近白），
      // 只能用于文字/描边，绝不能当填充色配白字，否则深色主题下就是白底白字。
      // 填充按钮必须用官方对照填充 + 反色文字这对 token。
      accentFill: "var(--dsw-alias-button-primary-fill, #3b82f6)",
      onAccentFill: "var(--dsw-alias-label-primary-inverted, #ffffff)",
      danger: "var(--dsw-alias-state-error-primary, #ef4444)",
      dangerBg: "rgba(239, 68, 68, 0.12)",
      warning: "var(--dsw-alias-state-warn-primary, #f59e0b)",
      warningBg: "rgba(245, 158, 11, 0.12)",
      success: "var(--dsw-alias-state-success-primary, #10b981)",
      successBg: "rgba(16, 185, 129, 0.12)",
      roleSys: "#3b82f6",
      roleUser: "#10b981",
      roleAssistant: "#8b5cf6",
    };

    const S = {
      container: {
        width: "100%",
        maxWidth: "960px",
        display: "flex",
        flexDirection: "column",
        gap: "20px",
        color: THEME.ink,
        fontFamily: "inherit",
        padding: "4px 0 32px",
      },
      header: {
        display: "flex",
        flexDirection: "column",
        gap: "6px",
      },
      title: {
        margin: 0,
        fontSize: "24px",
        fontWeight: 700,
        letterSpacing: "-0.02em",
        color: THEME.ink,
      },
      subtitle: {
        margin: 0,
        fontSize: "13px",
        color: THEME.muted,
        lineHeight: 1.5,
      },
      divider: {
        height: "1px",
        background: THEME.border,
        border: "none",
        margin: "6px 0 4px",
      },
      navBar: {
        display: "flex",
        alignItems: "center",
        gap: "10px",
        flexWrap: "wrap",
      },
      navButton: (active) => ({
        padding: "8px 18px",
        borderRadius: "8px",
        border: "1px solid " + (active ? THEME.accentFill : THEME.border),
        background: active ? THEME.accentFill : THEME.panel,
        color: active ? THEME.onAccentFill : THEME.ink,
        fontSize: "13px",
        fontWeight: active ? 600 : 500,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        transition: "all 0.15s ease",
      }),
      btnPrimary: {
        padding: "8px 18px",
        borderRadius: "8px",
        border: "1px solid transparent",
        background: THEME.accentFill,
        color: THEME.onAccentFill,
        fontSize: "13px",
        fontWeight: 600,
        cursor: "pointer",
        transition: "background 0.15s",
      },
      btnSecondary: {
        padding: "8px 16px",
        borderRadius: "8px",
        border: "1px solid " + THEME.border,
        background: THEME.panel,
        color: THEME.ink,
        fontSize: "13px",
        fontWeight: 500,
        cursor: "pointer",
        transition: "all 0.15s",
      },
      btnDanger: {
        padding: "8px 16px",
        borderRadius: "8px",
        border: "1px solid rgba(239, 68, 68, 0.4)",
        background: THEME.dangerBg,
        color: THEME.danger,
        fontSize: "13px",
        fontWeight: 500,
        cursor: "pointer",
      },
      btnTools: {
        padding: "7px 14px",
        borderRadius: "8px",
        border: "1px solid " + THEME.accent,
        background: "rgba(59, 130, 246, 0.12)",
        color: THEME.accent,
        fontSize: "12px",
        fontWeight: 600,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
      },
      card: {
        background: THEME.panel,
        border: "1px solid " + THEME.border,
        borderRadius: "12px",
        padding: "18px",
        display: "flex",
        flexDirection: "column",
        gap: "14px",
        transition: "border-color 0.2s, box-shadow 0.2s",
      },
      presetCard: {
        background: THEME.panel,
        border: "1px solid " + THEME.border,
        borderRadius: "12px",
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        cursor: "pointer",
        transition: "all 0.2s ease",
      },
      input: {
        width: "100%",
        padding: "9px 12px",
        fontSize: "13px",
        background: "var(--dsw-alias-bg-layer-2, rgba(255,255,255,.05))",
        color: THEME.ink,
        border: "1px solid " + THEME.border,
        borderRadius: "8px",
        outline: "none",
        boxSizing: "border-box",
      },
      textarea: {
        width: "100%",
        minHeight: "110px",
        padding: "12px",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: "12.5px",
        lineHeight: 1.6,
        background: "var(--dsw-alias-bg-layer-2, rgba(255,255,255,.04))",
        color: THEME.ink,
        border: "1px solid " + THEME.border,
        borderRadius: "8px",
        outline: "none",
        resize: "vertical",
        boxSizing: "border-box",
      },
      badge: (bg, color) => ({
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: "999px",
        fontSize: "11px",
        fontWeight: 600,
        background: bg,
        color: color,
        letterSpacing: "0.02em",
      }),
      modalOverlay: {
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.65)",
        backdropFilter: "blur(3px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "20px",
      },
      modalContent: {
        background: "var(--dsw-alias-bg-overlay, #18191d)",
        border: "1px solid " + THEME.border,
        borderRadius: "14px",
        width: "100%",
        maxWidth: "680px",
        maxHeight: "85vh",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
        overflow: "hidden",
      },
      warningBanner: {
        padding: "10px 14px",
        borderRadius: "8px",
        background: THEME.warningBg,
        border: "1px solid rgba(245, 158, 11, 0.35)",
        color: THEME.warning,
        fontSize: "12px",
        lineHeight: 1.5,
        display: "flex",
        alignItems: "center",
        gap: "8px",
      },
    };

    // 正常开发的三个英文标准字段名（不带括号）
    const ROLE_OPTIONS = [
      { key: "system", label: "system", color: THEME.roleSys },
      { key: "user", label: "user", color: THEME.roleUser },
      { key: "assistant", label: "assistant", color: THEME.roleAssistant },
    ];

    function downloadFile(content, filename, contentType = "application/json") {
      const blob = new Blob([content], { type: contentType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    // 官方内置预设的默认模型绑定行（官方预设定义只读，只维护模型绑定）
    function OfficialPresetModelRow({ preset, providers, onSave, disabled }) {
      const initial = preset.boundModel || null;
      const [draft, setDraft] = useState(initial);
      const [saving, setSaving] = useState(false);
      const [error, setError] = useState("");
      const providerId = draft && draft.provider ? draft.provider : "";
      const providerEntry = providers.find((p) => p.id === providerId);
      const models = providerEntry ? providerEntry.models || [] : [];
      const modelEntry = models.find((m) => m.id === (draft && draft.model));
      const efforts = (modelEntry && modelEntry.reasoning && modelEntry.reasoning.efforts) || [];
      const labelStyle = { display: "block", fontSize: "11px", color: THEME.muted, marginBottom: "4px" };

      const commit = () => {
        setSaving(true);
        setError("");
        Promise.resolve(onSave(preset.id, draft))
          .then((result) => {
            if (result && result.ok === false) setError(result.error || "保存失败");
          })
          .catch((e) => setError(e && e.message ? e.message : String(e)))
          .finally(() => setSaving(false));
      };

      return h("div", { style: Object.assign({}, S.card, { gap: "8px", padding: "12px 14px" }) },
        h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" } },
          h("div", null,
            h("span", { style: { fontSize: "13px", fontWeight: 600, color: THEME.ink } }, preset.displayName || preset.name),
            h("code", { style: { marginLeft: "8px", fontSize: "11px", color: THEME.muted } }, preset.id),
            preset.isDefault ? h("span", { style: Object.assign({}, S.badge("rgba(16,185,129,.15)", THEME.success), { marginLeft: "8px" }) }, "DSH 默认") : null,
            preset.displayDescription ? h("div", { style: { fontSize: "11px", color: THEME.muted, marginTop: "2px" } }, preset.displayDescription) : null,
          ),
          h("span", { style: { fontSize: "11px", color: THEME.muted } }, "官方预设 · 只读定义"),
        ),
        h("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "8px" } },
          h("div", null,
            h("label", { style: labelStyle }, "上游 Provider"),
            h("select", {
              style: S.input,
              value: providerId,
              onChange: (e) => {
                const nextProvider = e.target.value;
                if (!nextProvider) { setDraft(null); return; }
                const firstModel = ((providers.find((p) => p.id === nextProvider) || {}).models || [])[0];
                setDraft(firstModel ? { provider: nextProvider, model: firstModel.id } : { provider: nextProvider, model: "" });
              },
            },
              h("option", { value: "" }, "不绑定"),
              providers.map((p) => h("option", { key: p.id, value: p.id }, (p.name || p.id) + "（" + p.id + "）")),
            ),
          ),
          h("div", null,
            h("label", { style: labelStyle }, "模型"),
            h("select", {
              style: S.input,
              value: (draft && draft.model) || "",
              disabled: !providerEntry,
              onChange: (e) => {
                const modelId = e.target.value;
                if (!modelId) { setDraft(draft ? { ...draft, model: "" } : null); return; }
                const entry = models.find((m) => m.id === modelId);
                const defaultEffort = entry && entry.reasoning && entry.reasoning.defaultEffort;
                setDraft({ provider: providerId, model: modelId, ...(defaultEffort ? { reasoningEffort: defaultEffort } : {}) });
              },
            },
              h("option", { value: "" }, providerEntry ? "选择模型…" : "先选上游"),
              models.map((m) => h("option", { key: m.id, value: m.id }, (m.name || m.id) + "（" + m.id + "）")),
            ),
          ),
          h("div", null,
            h("label", { style: labelStyle }, "思考强度"),
            h("select", {
              style: S.input,
              value: (draft && draft.reasoningEffort) || "",
              disabled: efforts.length === 0,
              onChange: (e) => {
                const effort = e.target.value;
                setDraft({ provider: providerId, model: (draft && draft.model) || "", ...(effort ? { reasoningEffort: effort } : {}) });
              },
            },
              h("option", { value: "" }, efforts.length ? "跟随模型默认" : "无选项"),
              efforts.map((effort) => h("option", { key: effort.id, value: effort.id }, (effort.name || effort.id) + "（" + effort.id + "）")),
            ),
          ),
        ),
        h("div", { style: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" } },
          h("button", {
            style: Object.assign({}, S.btnPrimary, { padding: "5px 12px", fontSize: "12px" }, (disabled || saving) ? { opacity: 0.6, cursor: "default" } : {}),
            disabled: disabled || saving,
            onClick: commit,
          }, saving ? "保存中…" : "保存模型绑定"),
          draft ? h("button", {
            style: Object.assign({}, S.btnSecondary, { padding: "5px 12px", fontSize: "12px" }),
            disabled: disabled || saving,
            onClick: () => { setDraft(null); setSaving(true); Promise.resolve(onSave(preset.id, null)).catch(() => {}).finally(() => setSaving(false)); },
          }, "清除") : null,
          preset.boundModel ? h("code", { style: { fontSize: "11px", color: THEME.warning, wordBreak: "break-all" } },
            "当前：" + preset.boundModel.provider + "/" + preset.boundModel.model + (preset.boundModel.reasoningEffort ? " · " + preset.boundModel.reasoningEffort : "")) : null,
          error ? h("span", { style: { fontSize: "12px", color: THEME.danger } }, error) : null,
        ),
      );
    }

    function PresetEditorMain() {
      // 视图状态: 'current' (预设列表) | 'edit' (编辑页面) | 'create' (新建页面)
      const [view, setView] = useState("current");
      const [doc, setDoc] = useState(null);
      const [allTools, setAllTools] = useState([]);
      const [runtimeTools, setRuntimeTools] = useState([]);
      const [filteredDshCount, setFilteredDshCount] = useState(0);
      const [notice, setNotice] = useState({ kind: "idle", text: "" });
      const [busy, setBusy] = useState(false);

      // 编辑/新建预设草稿
      const [draft, setDraft] = useState(null);
      const [showToolsModal, setShowToolsModal] = useState(false);
      const [showVariablesModal, setShowVariablesModal] = useState(false);
      const [deleteConfirmId, setDeleteConfirmId] = useState(null);

      // 项目文件夹默认预设：本地编辑草稿 + 宿主运行时信息
      const [projectDraft, setProjectDraft] = useState(null);
      const [projectInfo, setProjectInfo] = useState(null);
      const [projectRuntime, setProjectRuntime] = useState(null);
      const [newRule, setNewRule] = useState({ path: "", presetId: "", enabled: true });
      const [projectBusy, setProjectBusy] = useState(false);
      // 预设名册（自定义 + 官方内置）与上游模型目录
      const [presetRoster, setPresetRoster] = useState([]);
      const [modelCatalog, setModelCatalog] = useState(null);
      const [modelBusy, setModelBusy] = useState(false);

      const fileInputRef = useRef(null);

      // 加载所有预设与状态
      const loadState = useCallback(() => {
        setBusy(true);
        fetch("/dsh-preset-editor/state", { cache: "no-store" })
          .then((r) => r.json())
          .then((d) => {
            if (d.ok) {
              setDoc(d.doc);
              setProjectInfo(d.projectDefaultsInfo || null);
              setProjectRuntime(d.projectRuntime || null);
              setPresetRoster(d.presetRoster || []);
            } else {
              setNotice({ kind: "error", text: "读取预设失败: " + (d.error || "") });
            }
          })
          .catch((e) => setNotice({ kind: "error", text: "网络请求异常: " + e.message }))
          .finally(() => setBusy(false));
      }, []);

      const cloneProjectDefaults = (value) => {
        const src = value && typeof value === "object" ? value : {};
        return {
          enabled: src.enabled === true,
          rules: Array.isArray(src.rules) ? JSON.parse(JSON.stringify(src.rules)) : [],
        };
      };

      // 单独刷新「项目默认预设」：会重置未保存的草稿
      const loadProjects = useCallback(() => {
        setBusy(true);
        fetch("/dsh-preset-editor/state", { cache: "no-store" })
          .then((r) => r.json())
          .then((d) => {
            if (d.ok) {
              setDoc(d.doc);
              setProjectInfo(d.projectDefaultsInfo || null);
              setProjectRuntime(d.projectRuntime || null);
              setPresetRoster(d.presetRoster || []);
              setProjectDraft(cloneProjectDefaults(d.doc && d.doc.projectDefaults));
            } else {
              setNotice({ kind: "error", text: "读取项目默认预设失败: " + (d.error || "") });
            }
          })
          .catch((e) => setNotice({ kind: "error", text: "网络请求异常: " + e.message }))
          .finally(() => setBusy(false));
      }, []);

      // 加载所有可用 AI 工具列表
      const loadTools = useCallback(() => {
        fetch("/dsh-preset-editor/tools", { cache: "no-store" })
          .then((r) => r.json())
          .then((d) => {
            if (d.ok) {
              setAllTools(d.tools || []);
              setRuntimeTools(d.runtimeTools || []);
              setFilteredDshCount(Number(d.filteredDshCount) || 0);
            }
          })
          .catch(() => {});
      }, []);

      // 加载当前 DSH 已配置上游的模型目录（用于预设绑定默认模型）
      const loadModels = useCallback(() => {
        setModelBusy(true);
        fetch("/dsh-preset-editor/models", { cache: "no-store" })
          .then((r) => r.json())
          .then((d) => {
            if (d.ok) {
              setModelCatalog(d);
            } else {
              setNotice({ kind: "error", text: "读取模型目录失败: " + (d.error || "") });
            }
          })
          .catch((e) => setNotice({ kind: "error", text: "读取模型目录失败: " + e.message }))
          .finally(() => setModelBusy(false));
      }, []);

      // 保存/清除任意预设（含官方内置）的默认模型绑定
      const handleSavePresetModel = useCallback((presetId, model) => {
        return fetch("/dsh-preset-editor/preset-model", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ presetId, model }),
        })
          .then((r) => r.json())
          .then((d) => {
            if (d.ok) {
              setDoc(d.doc);
              setPresetRoster(d.presetRoster || []);
              setNotice({ kind: "ok", text: `已保存预设 ${presetId} 的默认模型绑定` });
              return { ok: true };
            }
            setNotice({ kind: "error", text: "保存模型绑定失败: " + (d.error || "") });
            return { ok: false, error: d.error || "保存失败" };
          })
          .catch((e) => {
            setNotice({ kind: "error", text: "保存模型绑定失败: " + e.message });
            return { ok: false, error: e.message };
          });
      }, []);

      useEffect(() => {
        loadState();
        loadTools();
        loadModels();
      }, [loadState, loadTools, loadModels]);

      // 提示清理计时器
      useEffect(() => {
        if (notice.kind !== "idle") {
          const t = setTimeout(() => setNotice({ kind: "idle", text: "" }), 5000);
          return () => clearTimeout(t);
        }
      }, [notice]);

      // 进入新建预设页面
      const handleOpenCreate = () => {
        const defaultToolIds = allTools.filter((t) => t.defaultEnabled).map((t) => t.id);
        loadModels();
        setDraft({
          id: "",
          name: "",
          description: "",
          model: null,
          enabledTools: defaultToolIds.length > 0 ? defaultToolIds : ["time-context", "tool-bash", "tool-pwsh", "tool-fs", "tool-fs-search", "tool-jobs", "tool-web", "tool-skill", "tool-ask-user", "tool-todo", "tool-present", "tool-goal", "plan-mode", "tool-subagent", "tool-schedule", "compaction"],
          // 顶级第一条必须是 system 且为启用状态
          entries: [
            { id: "e-1", role: "system", text: "", enabled: true },
            { id: "e-2", role: "user", text: "", enabled: true },
            { id: "e-3", role: "assistant", text: "", enabled: true },
          ],
        });
        setView("create");
        setNotice({ kind: "idle", text: "" });
      };

      // 进入编辑预设页面
      const handleOpenEdit = (preset) => {
        const copy = JSON.parse(JSON.stringify(preset));
        // 确保顶级第一条必须是启用状态的 system
        if (copy.entries && copy.entries.length > 0) {
          copy.entries[0].role = "system";
          copy.entries[0].enabled = true;
        }
        if (!copy.model || typeof copy.model !== "object") copy.model = null;
        loadModels();
        setDraft(copy);
        setView("edit");
        setNotice({ kind: "idle", text: "" });
      };

      // 取消编辑/新建，返回当前预设页面
      const handleCancel = () => {
        setDraft(null);
        setView("current");
      };

      // 保存预设
      const handleSave = () => {
        if (!draft) return;
        const idClean = draft.id.trim().toLowerCase();
        if (!idClean) {
          setNotice({ kind: "error", text: "请输入预设 ID。" });
          return;
        }
        if (!/^[a-z0-9][a-z0-9-]*$/.test(idClean)) {
          setNotice({ kind: "error", text: "预设 ID 只能由小写字母、数字和短横线组成，且以字母或数字开头。" });
          return;
        }
        if (!draft.name.trim()) {
          setNotice({ kind: "error", text: "请输入预设名称。" });
          return;
        }

        // 强约束校验：顶级必须有一个 system 处于启用状态
        if (!draft.entries || draft.entries.length === 0) {
          setNotice({ kind: "error", text: "预设消息列表不能为空，顶级必须有一个 system 提示词。" });
          return;
        }
        if (draft.entries[0].role !== "system" || draft.entries[0].enabled !== true) {
          setNotice({ kind: "error", text: "顶级第一条必须是 system 且必须处于启用状态！" });
          return;
        }

        // 模板变量校验：只有 system 会走 DSH 的 persona 插值，只支持 model / provider。
        const badVars = new Set();
        for (const entry of draft.entries) {
          if (entry.role !== "system" || entry.enabled === false) continue;
          const re = /\{\{([^{}]*)\}\}/g;
          let match;
          while ((match = re.exec(String(entry.text || "")))) {
            const raw = match[1];
            if (!/^[a-z][a-z0-9_]*$/.test(raw) || (raw !== "model" && raw !== "provider")) {
              badVars.add(match[0]);
            }
          }
        }
        if (badVars.size > 0) {
          setNotice({
            kind: "error",
            text: `system 提示词里有不支持的模板变量 ${[...badVars].join("、")}。只支持 {{model}}、{{provider}}；工作目录、时间等由系统自动注入。`,
          });
          return;
        }

        // 默认模型绑定校验：要么不绑定，要么 provider + model 都有
        const boundModel =
          draft.model && draft.model.provider && draft.model.model
            ? {
                provider: draft.model.provider,
                model: draft.model.model,
                ...(draft.model.reasoningEffort
                  ? { reasoningEffort: draft.model.reasoningEffort }
                  : {}),
              }
            : null;
        if (draft.model && (draft.model.provider || draft.model.model) && !boundModel) {
          setNotice({ kind: "error", text: "默认模型需要同时选择上游与模型，或清空绑定。" });
          return;
        }

        setBusy(true);
        fetch("/dsh-preset-editor/save", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            preset: { ...draft, id: idClean, model: boundModel },
          }),
        })
          .then((r) => r.json())
          .then((d) => {
            if (d.ok) {
              setDoc(d.doc);
              setNotice({ kind: "ok", text: `预设【${draft.name}】已成功保存并同步，新对话即可生效！` });
              setView("current");
              setDraft(null);
            } else {
              setNotice({ kind: "error", text: "保存失败: " + (d.error || "") });
            }
          })
          .catch((e) => setNotice({ kind: "error", text: "保存请求失败: " + e.message }))
          .finally(() => setBusy(false));
      };

      // 删除预设
      const handleDelete = (id) => {
        setBusy(true);
        fetch("/dsh-preset-editor/delete", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id }),
        })
          .then((r) => r.json())
          .then((d) => {
            if (d.ok) {
              setDoc(d.doc);
              setNotice({ kind: "ok", text: "预设已成功删除。" });
              if (view === "edit" && draft && draft.id === id) {
                setView("current");
                setDraft(null);
              }
            } else {
              setNotice({ kind: "error", text: "删除失败: " + (d.error || "") });
            }
          })
          .catch((e) => setNotice({ kind: "error", text: "删除失败: " + e.message }))
          .finally(() => {
            setBusy(false);
            setDeleteConfirmId(null);
          });
      };

      // 导出单个预设
      const handleExportSingle = (id, name) => {
        fetch("/dsh-preset-editor/export?id=" + encodeURIComponent(id))
          .then((r) => r.text())
          .then((text) => {
            downloadFile(text, `preset-${name || id}.json`);
            setNotice({ kind: "ok", text: `预设【${name || id}】导出成功。` });
          })
          .catch((e) => setNotice({ kind: "error", text: "导出失败: " + e.message }));
      };

      // 导入预设文件处理
      const handleImportClick = () => {
        if (fileInputRef.current) {
          fileInputRef.current.click();
        }
      };

      const handleFileSelected = (event) => {
        const file = event.target.files && event.target.files[0];
        event.target.value = "";
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
          const raw = String(reader.result || "").trim();
          if (!raw) {
            setNotice({ kind: "error", text: "文件内容为空" });
            return;
          }
          setBusy(true);
          fetch("/dsh-preset-editor/import", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ raw }),
          })
            .then((r) => r.json())
            .then((d) => {
              if (d.ok) {
                setDoc(d.doc);
                setNotice({ kind: "ok", text: "预设导入成功！已同步至官方自定义预设。" });
                setView("current");
              } else {
                setNotice({ kind: "error", text: "导入失败: " + (d.error || "") });
              }
            })
            .catch((e) => setNotice({ kind: "error", text: "导入失败: " + e.message }))
            .finally(() => setBusy(false));
        };
        reader.onerror = () => setNotice({ kind: "error", text: "读取文件失败" });
        reader.readAsText(file);
      };

      // ── 项目文件夹默认预设 ────────────────────────────────────────────────
      const updateProjectRule = (index, patch) => {
        setProjectDraft((prev) => {
          if (!prev) return prev;
          const rules = prev.rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule));
          return { ...prev, rules };
        });
      };

      const handleAddProjectRule = () => {
        const pathValue = String(newRule.path || "").trim();
        if (!pathValue) {
          setNotice({ kind: "error", text: "请填写或选择项目文件夹路径。" });
          return;
        }
        if (!newRule.presetId) {
          setNotice({ kind: "error", text: "请选择该文件夹要使用的预设。" });
          return;
        }
        setProjectDraft((prev) => {
          const base = prev || { enabled: false, rules: [] };
          const rule = {
            id: "pd-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            path: pathValue,
            presetId: newRule.presetId,
            enabled: newRule.enabled !== false,
          };
          return { ...base, rules: [...base.rules, rule] };
        });
        setNewRule({ path: "", presetId: "", enabled: true });
        setNotice({ kind: "ok", text: "规则已加入草稿，点击「保存设置」生效。" });
      };

      const handleRemoveProjectRule = (index) => {
        setProjectDraft((prev) => {
          if (!prev) return prev;
          return { ...prev, rules: prev.rules.filter((_, i) => i !== index) };
        });
      };

      const handlePickProjectDirectory = () => {
        let pick;
        try {
          if (directoryPicker && typeof directoryPicker.pick === "function") {
            pick = directoryPicker.pick;
          } else {
            const service =
              (clientCtx && clientCtx.uiWorkspace) ||
              (clientCtx && typeof clientCtx.get === "function" && clientCtx.get("uiWorkspace")) ||
              null;
            if (service && typeof service.pickDirectory === "function") {
              pick = () => service.pickDirectory();
            }
          }
        } catch {
          pick = undefined;
        }
        if (typeof pick !== "function") {
          setNotice({ kind: "error", text: "当前环境不支持目录选择器，请直接粘贴绝对路径。" });
          return;
        }
        Promise.resolve()
          .then(() => pick())
          .then((picked) => {
            if (typeof picked === "string" && picked.trim()) {
              setNewRule((prev) => ({ ...prev, path: picked }));
            }
          })
          .catch((error) => {
            setNotice({ kind: "error", text: "打开目录选择器失败: " + (error && error.message ? error.message : error) });
          });
      };

      const handleSaveProjects = () => {
        if (!projectDraft) return;
        setProjectBusy(true);
        fetch("/dsh-preset-editor/projects", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ projectDefaults: projectDraft }),
        })
          .then((r) => r.json())
          .then((d) => {
            if (d.ok) {
              setDoc(d.doc);
              setProjectInfo(d.projectDefaultsInfo || null);
              setProjectDraft(cloneProjectDefaults(d.doc && d.doc.projectDefaults));
              setNotice({ kind: "ok", text: "项目文件夹默认预设已保存，新建会话即按工作目录生效。" });
            } else {
              setNotice({ kind: "error", text: "保存失败: " + (d.error || "") });
            }
          })
          .catch((e) => setNotice({ kind: "error", text: "保存请求失败: " + e.message }))
          .finally(() => setProjectBusy(false));
      };

      // 草稿消息条目操作
      const updateDraftField = (key, val) => {
        setDraft((prev) => ({ ...prev, [key]: val }));
      };

      const updateEntry = (idx, patch) => {
        setDraft((prev) => {
          const entries = prev.entries.map((e, i) => {
            if (i === idx) {
              // 顶级第一条强制保持 system 且启用
              if (idx === 0) {
                return { ...e, ...patch, role: "system", enabled: true };
              }
              return { ...e, ...patch };
            }
            return e;
          });
          return { ...prev, entries };
        });
      };

      const addEntry = (role = "user") => {
        setDraft((prev) => ({
          ...prev,
          entries: [
            ...prev.entries,
            { id: "e-" + Date.now(), role, text: "", enabled: true },
          ],
        }));
      };

      const removeEntry = (idx) => {
        if (idx === 0) return; // 顶级第一条不允许删除
        setDraft((prev) => ({
          ...prev,
          entries: prev.entries.filter((_, i) => i !== idx),
        }));
      };

      const moveEntry = (idx, dir) => {
        // 第一条顶级不可移动；其他条目不可移动到第 0 位
        const targetIdx = idx + dir;
        if (idx === 0 || targetIdx <= 0) return;

        setDraft((prev) => {
          if (targetIdx >= prev.entries.length) return prev;
          const copy = [...prev.entries];
          const item = copy[idx];
          copy[idx] = copy[targetIdx];
          copy[targetIdx] = item;
          return { ...prev, entries: copy };
        });
      };

      // 工具勾选切换
      const toggleTool = (toolId) => {
        setDraft((prev) => {
          const set = new Set(prev.enabledTools || []);
          if (set.has(toolId)) {
            set.delete(toolId);
          } else {
            set.add(toolId);
          }
          return { ...prev, enabledTools: Array.from(set) };
        });
      };

      const presetsList = doc && doc.presets ? Object.values(doc.presets) : [];

      // 渲染顶部固定标题与说明（完全符合用户要求）
      const renderHeader = () => {
        return h("div", { style: S.header },
          h("h1", { style: S.title }, "预设编辑"),
          h("p", { style: S.subtitle }, "可视化编辑预设，选择一个预设并保存，新对话即可生效；也可按项目文件夹指定默认预设。"),
          h("hr", { style: S.divider }),
          h("div", { style: S.navBar },
            h("button", {
              style: S.navButton(view === "current"),
              onClick: () => { setView("current"); setDraft(null); loadState(); },
            }, "当前预设"),
            h("button", {
              style: S.navButton(view === "projects"),
              onClick: () => { setView("projects"); setDraft(null); loadProjects(); },
            }, "项目默认"),
            h("button", {
              style: S.navButton(view === "create"),
              onClick: handleOpenCreate,
            }, "+ 新建预设"),
            h("button", {
              style: S.navButton(false),
              onClick: handleImportClick,
            }, "导入预设"),
            h("button", {
              style: S.navButton(showVariablesModal),
              onClick: () => setShowVariablesModal(true),
            }, "预设说明"),
            // 状态提示
            notice.kind === "ok" ? h("span", {
              style: {
                marginLeft: "auto",
                fontSize: "12px",
                color: THEME.success,
                background: THEME.successBg,
                padding: "4px 10px",
                borderRadius: "6px",
              },
            }, "✓ " + notice.text) : null,
            notice.kind === "error" ? h("span", {
              style: {
                marginLeft: "auto",
                fontSize: "12px",
                color: THEME.danger,
                background: THEME.dangerBg,
                padding: "4px 10px",
                borderRadius: "6px",
              },
            }, "⚠ " + notice.text) : null,
          ),
          h("input", {
            type: "file",
            accept: ".json,application/json",
            ref: fileInputRef,
            style: { display: "none" },
            onChange: handleFileSelected,
          }),
        );
      };

      // 渲染当前预设列表视图（初次安装默认为空）
      const renderCurrentView = () => {
        if (!doc) {
          return h("p", { style: { color: THEME.muted, fontSize: "13px" } }, "正在读取预设…");
        }

        if (presetsList.length === 0) {
          return h("div", { style: Object.assign({}, S.card, { alignItems: "center", padding: "48px 20px" }) },
            h("div", { style: { fontSize: "36px", marginBottom: "8px" } }, "📝"),
            h("p", { style: { color: THEME.ink, fontSize: "15px", fontWeight: 600, margin: "0 0 6px" } }, "暂无任何自定义预设"),
            h("p", { style: { color: THEME.muted, fontSize: "13px", margin: "0 0 18px", textAlign: "center", maxWidth: "420px" } },
              "点击下方按钮新建您的第一个专属预设，保存后可在聊天页面右上角一键切换，享受全套自定义提示词与配备工具。"),
            h("button", { style: S.btnPrimary, onClick: handleOpenCreate }, "+ 新建预设"),
          );
        }

        return h("div", { style: { display: "flex", flexDirection: "column", gap: "12px" } },
          h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
            h("span", { style: { fontSize: "13px", color: THEME.muted } }, `共 ${presetsList.length} 个已配置预设（已无缝同步至官方 Agent 自定义预设）`),
          ),
          h("div", {
            style: {
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: "14px",
            },
          },
            presetsList.map((p) => {
              const toolCount = (p.enabledTools || []).length;
              const sysCount = (p.entries || []).filter((e) => e.role === "system").length;
              const userCount = (p.entries || []).filter((e) => e.role === "user").length;
              const asstCount = (p.entries || []).filter((e) => e.role === "assistant").length;

              return h("div", {
                key: p.id,
                style: S.presetCard,
                onClick: () => handleOpenEdit(p),
              },
                // 顶部标题与 ID
                h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" } },
                  h("div", null,
                    h("div", { style: { fontSize: "15px", fontWeight: 650, color: THEME.ink } }, p.name || p.id),
                    h("div", { style: { fontSize: "11px", color: THEME.muted, marginTop: "2px", fontFamily: "monospace" } }, "ID: " + p.id),
                  ),
                  h("span", {
                    style: S.badge("rgba(59, 130, 246, 0.15)", THEME.accent),
                  }, `${toolCount} 个工具`),
                ),
                // 默认模型绑定
                p.model && p.model.provider && p.model.model
                  ? h("div", { style: { display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" } },
                      h("span", { style: S.badge("rgba(245, 158, 11, 0.15)", THEME.warning) }, "默认模型"),
                      h("code", { style: { fontSize: "11px", color: THEME.muted, fontFamily: "monospace", wordBreak: "break-all" } },
                        p.model.provider + "/" + p.model.model + (p.model.reasoningEffort ? " · " + p.model.reasoningEffort : "")),
                    )
                  : null,
                // 描述
                p.description ? h("p", {
                  style: {
                    margin: 0,
                    fontSize: "12px",
                    color: THEME.muted,
                    lineHeight: 1.5,
                    maxHeight: "36px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  },
                }, p.description) : null,
                // 结构标签
                h("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" } },
                  h("span", { style: S.badge("rgba(59, 130, 246, 0.12)", THEME.roleSys) }, `system: ${sysCount}`),
                  h("span", { style: S.badge("rgba(16, 185, 129, 0.12)", THEME.roleUser) }, `user: ${userCount}`),
                  h("span", { style: S.badge("rgba(139, 92, 246, 0.12)", THEME.roleAssistant) }, `assistant: ${asstCount}`),
                  h("span", { style: { fontSize: "11px", color: THEME.dim, marginLeft: "auto" } }, `总计 ${(p.entries || []).length} 条`),
                ),
                // 卡片操作按钮行
                h("div", {
                  style: {
                    display: "flex",
                    justifyContent: "flex-end",
                    alignItems: "center",
                    gap: "8px",
                    marginTop: "4px",
                    paddingTop: "8px",
                    borderTop: "1px solid " + THEME.borderLight,
                  },
                  onClick: (e) => e.stopPropagation(),
                },
                  h("button", {
                    style: Object.assign({}, S.btnSecondary, { padding: "4px 10px", fontSize: "12px" }),
                    onClick: (e) => { e.stopPropagation(); handleOpenEdit(p); },
                  }, "编辑"),
                  h("button", {
                    style: Object.assign({}, S.btnSecondary, { padding: "4px 10px", fontSize: "12px" }),
                    onClick: (e) => { e.stopPropagation(); handleExportSingle(p.id, p.name); },
                  }, "导出"),
                  deleteConfirmId === p.id
                    ? h("div", { style: { display: "inline-flex", gap: "4px", alignItems: "center" } },
                      h("button", {
                        style: Object.assign({}, S.btnDanger, { padding: "4px 8px", fontSize: "11px" }),
                        onClick: (e) => { e.stopPropagation(); handleDelete(p.id); },
                      }, "确认删除"),
                      h("button", {
                        style: Object.assign({}, S.btnSecondary, { padding: "4px 8px", fontSize: "11px" }),
                        onClick: (e) => { e.stopPropagation(); setDeleteConfirmId(null); },
                      }, "取消"),
                    )
                    : h("button", {
                      style: Object.assign({}, S.btnSecondary, { padding: "4px 10px", fontSize: "12px", color: THEME.danger }),
                      onClick: (e) => { e.stopPropagation(); setDeleteConfirmId(p.id); },
                    }, "删除"),
                ),
              );
            }),
          ),
          // DSH 官方预设：定义只读，但可以绑定默认模型
          (() => {
            const officialRows = (presetRoster || []).filter((row) => row.source === "official");
            if (officialRows.length === 0) return null;
            return h("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } },
              h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" } },
                h("div", null,
                  h("span", { style: { fontSize: "14px", fontWeight: 650, color: THEME.ink } }, "DSH 官方预设"),
                  h("span", { style: { fontSize: "12px", color: THEME.muted, marginLeft: "8px" } }, "定义只读；可绑定默认模型与思考强度"),
                ),
                h("button", { style: S.btnSecondary, onClick: loadModels }, "刷新模型目录"),
              ),
              officialRows.map((row) => h(OfficialPresetModelRow, {
                key: row.id,
                preset: row,
                providers: (modelCatalog && modelCatalog.providers) || [],
                onSave: handleSavePresetModel,
                disabled: modelBusy,
              })),
            );
          })(),
        );
      };

      // 渲染「项目默认」视图：按项目文件夹指定默认预设（总开关 + 规则）
      const renderProjectsView = () => {
        if (!projectDraft) {
          return h("p", { style: { color: THEME.muted, fontSize: "13px" } }, "正在读取项目默认预设…");
        }
        const info = projectInfo || {};
        const infoById = {};
        for (const row of Array.isArray(info.rules) ? info.rules : []) infoById[row.id] = row;
        // 预设选项 = 当前 DSH 名册（自定义 + 官方内置）；名册为空时退回本地预设
        const rosterRows = Array.isArray(presetRoster) && presetRoster.length > 0
          ? presetRoster
          : presetsList.map((p) => ({ id: p.id, name: p.name || p.id, source: "custom" }));
        const presetOptions = rosterRows.map((row) => ({
          id: row.id,
          name: row.name || row.id,
          displayName: row.displayName || row.name || row.id,
          displayDescription: row.displayDescription || row.description || "",
          source: row.source || "custom",
          broken: row.broken || null,
          isDefault: row.isDefault === true,
        }));
        const optionLabel = (option) =>
          (option.source === "official" ? "【官方】" : "【自定义】") +
          (option.displayName || option.name || option.id) +
          "（" +
          option.id +
          "）" +
          (option.broken ? " ⚠挂载失败" : "");
        const checkbox = {
          width: "16px",
          height: "16px",
          cursor: "pointer",
          accentColor: THEME.accentFill,
        };
        const mono = {
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: "12px",
        };
        const mutedText = { fontSize: "12px", color: THEME.muted };

        const renderRule = (rule, index) => {
          const runtimeInfo = infoById[rule.id] || rule;
          const missingPreset = runtimeInfo.presetExists === false;
          const notRegistered = runtimeInfo.presetExists === true && runtimeInfo.presetRegistered === false;
          const brokenPreset = Boolean(runtimeInfo.presetBroken);
          const missingPath = runtimeInfo.pathExists === false;
          const options = presetOptions.slice();
          if (!options.some((option) => option.id === rule.presetId)) {
            options.push({
              id: rule.presetId,
              name: rule.presetId + "（已不存在）",
              source: runtimeInfo.presetSource || "custom",
              broken: null,
            });
          }
          return h("div", {
            key: rule.id || "rule-" + index,
            style: Object.assign({}, S.card, { gap: "10px", padding: "14px 16px" }),
          },
            h("div", { style: { display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" } },
              h("input", {
                type: "checkbox",
                style: checkbox,
                checked: rule.enabled !== false,
                title: "启用/停用这条规则",
                onChange: (e) => updateProjectRule(index, { enabled: e.target.checked }),
              }),
              h("code", {
                style: Object.assign({
                  flex: 1,
                  minWidth: "220px",
                  color: THEME.ink,
                  wordBreak: "break-all",
                  background: "var(--dsw-alias-bg-layer-2, rgba(255,255,255,.05))",
                  border: "1px solid " + THEME.borderLight,
                  borderRadius: "6px",
                  padding: "5px 8px",
                }, mono),
              }, rule.path || "（空路径）"),
              h("button", {
                style: Object.assign({}, S.btnDanger, { padding: "4px 10px", fontSize: "12px" }),
                onClick: () => handleRemoveProjectRule(index),
              }, "删除"),
            ),
            h("div", { style: { display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" } },
              h("span", { style: mutedText }, "目录"),
              h("input", {
                style: Object.assign({}, S.input, { flex: 1, minWidth: "260px" }, mono),
                value: rule.path || "",
                placeholder: "项目文件夹绝对路径",
                onChange: (e) => updateProjectRule(index, { path: e.target.value }),
              }),
            ),
            h("div", { style: { display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" } },
              h("span", { style: mutedText }, "默认预设"),
              h("select", {
                style: Object.assign({}, S.input, { flex: 1, minWidth: "220px" }),
                value: rule.presetId || "",
                onChange: (e) => updateProjectRule(index, { presetId: e.target.value }),
              },
                options.map((option) => h("option", { key: option.id, value: option.id },
                  optionLabel(option))),
              ),
            ),
            missingPreset || notRegistered || brokenPreset || missingPath
              ? h("div", { style: Object.assign({}, S.warningBanner, { fontSize: "12px", alignItems: "flex-start" }) },
                  h("span", null,
                    missingPreset ? "⚠ 预设已不存在，本规则不会生效（回退 DSH 默认预设）。 " : "",
                    brokenPreset ? "⚠ 预设当前挂载失败（broken），本规则不会生效。 " : "",
                    notRegistered ? "⚠ 预设当前未注册成功，本规则不会生效。 " : "",
                    missingPath ? "⚠ 该目录当前不存在；首次在该目录新建会话时 DSH 会自动创建它。" : "",
                  ),
                )
              : null,
          );
        };

        return h("div", { style: { display: "flex", flexDirection: "column", gap: "16px" } },
          // 总开关与说明
          h("div", { style: S.card },
            h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" } },
              h("div", { style: { flex: 1, minWidth: "260px" } },
                h("div", { style: { fontSize: "15px", fontWeight: 650, color: THEME.ink } }, "按项目文件夹使用默认预设"),
                h("div", { style: { fontSize: "12px", color: THEME.muted, marginTop: "4px", lineHeight: 1.6 } },
                  "开启后，新建会话会读取会话的工作目录；命中规则时自动切换到该文件夹指定的预设（只在会话开始第一轮之前生效）。",
                  "本功能不会修改 DSH 官方默认预设；如果用户在新会话顶部手动选择了别的预设，以用户选择为准。"),
              ),
              h("button", {
                style: projectDraft.enabled ? S.btnPrimary : S.btnSecondary,
                onClick: () => setProjectDraft((prev) => ({ ...(prev || { rules: [] }), enabled: !(prev && prev.enabled) })),
              }, projectDraft.enabled ? "总开关：已开启" : "总开关：已关闭"),
            ),
            h("div", { style: { display: "flex", gap: "18px", flexWrap: "wrap", fontSize: "12px", color: THEME.muted } },
              h("span", null, "DSH 当前默认预设：", h("b", { style: { color: THEME.ink } }, (info.officialDefaultName ? info.officialDefaultName + "（" + info.officialDefaultPreset + "）" : null) || info.officialDefaultPreset || "（未知）")),
              h("span", null, "规则数量：" + projectDraft.rules.length),
              h("span", null, "匹配方式：目录完全一致（Windows 不区分大小写）"),
            ),
          ),
          // 新增规则
          h("div", { style: S.card },
            h("div", { style: { fontSize: "14px", fontWeight: 600, color: THEME.ink } }, "新增规则"),
            h("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" } },
              h("input", {
                style: Object.assign({}, S.input, { flex: 1, minWidth: "280px" }, mono),
                placeholder: "项目文件夹绝对路径，例如 C:\\Users\\Td\\Desktop\\AiWork\\projects\\foo",
                value: newRule.path,
                onChange: (e) => setNewRule((prev) => ({ ...prev, path: e.target.value })),
              }),
              h("button", { style: S.btnSecondary, onClick: handlePickProjectDirectory }, "选择文件夹"),
            ),
            h("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" } },
              h("select", {
                style: Object.assign({}, S.input, { flex: 1, minWidth: "220px" }),
                value: newRule.presetId,
                onChange: (e) => setNewRule((prev) => ({ ...prev, presetId: e.target.value })),
              },
                h("option", { value: "" }, "选择预设…"),
                presetOptions.map((option) => h("option", { key: option.id, value: option.id },
                  optionLabel(option))),
              ),
              h("label", { style: { display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: THEME.muted } },
                h("input", {
                  type: "checkbox",
                  style: checkbox,
                  checked: newRule.enabled !== false,
                  onChange: (e) => setNewRule((prev) => ({ ...prev, enabled: e.target.checked })),
                }),
                "加入后启用",
              ),
              h("button", { style: S.btnPrimary, onClick: handleAddProjectRule }, "+ 加入规则"),
            ),
            presetOptions.length === 0
              ? h("div", { style: Object.assign({}, S.warningBanner, { fontSize: "12px" }) },
                  "还没有自定义预设。请先在「当前预设」里新建或导入预设，再配置项目规则。")
              : null,
          ),
          // 规则列表
          h("div", { style: { display: "flex", flexDirection: "column", gap: "12px" } },
            h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" } },
              h("span", { style: { fontSize: "13px", color: THEME.muted } }, `规则列表（${projectDraft.rules.length} 条，保存后才写入磁盘）`),
              h("div", { style: { display: "flex", gap: "8px" } },
                h("button", { style: S.btnSecondary, onClick: loadProjects }, "刷新"),
                h("button", {
                  style: Object.assign({}, S.btnPrimary, projectBusy ? { opacity: 0.6, cursor: "default" } : {}),
                  disabled: projectBusy,
                  onClick: handleSaveProjects,
                }, projectBusy ? "保存中…" : "保存设置"),
              ),
            ),
            projectDraft.rules.length === 0
              ? h("div", { style: Object.assign({}, S.card, { alignItems: "center", padding: "32px 20px" }) },
                  h("p", { style: { color: THEME.muted, fontSize: "13px", margin: 0 } },
                    "暂无规则。添加后，只有这些文件夹里的新会话会使用指定预设；其它目录仍用 DSH 官方默认。"),
                )
              : projectDraft.rules.map(renderRule),
          ),
          // 最近生效记录（诊断）
          projectRuntime && (((projectRuntime.applied || []).length > 0) || ((projectRuntime.skipped || []).length > 0))
            ? h("div", { style: S.card },
                h("div", { style: { fontSize: "14px", fontWeight: 600, color: THEME.ink } }, "最近生效记录（诊断）"),
                (projectRuntime.applied || []).slice(0, 6).map((row, i) =>
                  h("div", { key: "applied-" + i, style: { fontSize: "12px", color: THEME.success, wordBreak: "break-all" } },
                    "✔ " + row.cwd + " → " + row.presetId + "（" + new Date(row.time).toLocaleString() + "）")),
                (projectRuntime.skipped || []).slice(0, 6).map((row, i) =>
                  h("div", { key: "skipped-" + i, style: { fontSize: "12px", color: THEME.muted, wordBreak: "break-all" } },
                    "– " + (row.cwd || "") + "：" + row.reason)),
              )
            : null,
        );
      };

      // 渲染「预设说明」弹窗：预设规则 + 当前可用变量 + 官方提示词注入规则（简版）
      const renderVariablesModal = () => {
        if (!showVariablesModal) return null;

        const variableCard = (code, label, desc) =>
          h("div", {
            style: {
              padding: "12px 14px",
              borderRadius: "8px",
              border: "1px solid " + THEME.border,
              background: THEME.panel,
            },
          },
            h("div", { style: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" } },
              h("code", { style: { color: THEME.accent, fontWeight: 700, fontSize: "13px" } }, code),
              h("span", { style: S.badge("rgba(59, 130, 246, 0.12)", THEME.accent) }, label),
            ),
            h("div", { style: { fontSize: "12px", color: THEME.muted, lineHeight: 1.6 } }, desc),
          );

        const ruleCard = (title, lines, accentColor) =>
          h("div", {
            style: {
              padding: "12px 14px",
              borderRadius: "8px",
              border: "1px solid " + THEME.border,
              background: THEME.panel,
              borderLeft: "3px solid " + accentColor,
            },
          },
            h("div", { style: { fontSize: "13px", fontWeight: 700, color: THEME.ink, marginBottom: "4px" } }, title),
            lines.map((line, i) =>
              h("div", { key: i, style: { fontSize: "12px", color: THEME.muted, lineHeight: 1.65 } }, line),
            ),
          );

        return h("div", {
          style: S.modalOverlay,
          onClick: () => setShowVariablesModal(false),
        },
          h("div", {
            style: S.modalContent,
            onClick: (e) => e.stopPropagation(),
          },
            // 头部
            h("div", {
              style: {
                padding: "16px 20px",
                borderBottom: "1px solid " + THEME.border,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              },
            },
              h("h3", { style: { margin: 0, fontSize: "16px", fontWeight: 650 } }, "预设说明（变量与提示词注入）"),
              h("button", {
                style: Object.assign({}, S.btnSecondary, { padding: "4px 10px", fontSize: "12px" }),
                onClick: () => setShowVariablesModal(false),
              }, "✕ 关闭"),
            ),
            // 内容区域
            h("div", {
              style: {
                padding: "18px 20px",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              },
            },
              // 顶端核心警示
              h("div", { style: S.warningBanner },
                h("span", { style: { fontSize: "18px", flexShrink: 0 } }, "⚠️"),
                h("div", null,
                  h("strong", null, "严格解析："),
                  " system 里的 {{...}} 由 DSH 核心在每次请求前解析。写错变量名、写了不支持的变量（例如 {{cwd}}），都会让整个预设报错、会话不可用。保存时本插件会先校验。",
                ),
              ),

              ruleCard("预设是什么", [
                "预设 = 这个会话专属的“插件套餐”：system 变成角色设定，user/assistant 是每轮注入的引导，勾选的工具决定 AI 能做什么。",
                "保存后会注册成官方 Agent 自定义预设，出现在官方设置页和聊天右上角的预设选择器中；system 为空则沿用部署默认人格。",
              ], THEME.roleSys),

              ruleCard("三种条目怎么生效", [
                "system：作为该预设的 persona 系统提示词，替换部署默认人格；不会被上下文压缩。",
                "user：每轮请求前注入的引导消息；不进对话记录，也不会被压缩。",
                "assistant：每轮请求前注入的“AI 已说过的话”；同样不进对话记录。",
              ], THEME.roleUser),

              h("div", { style: { fontSize: "13px", fontWeight: 700, color: THEME.ink, marginTop: "2px" } },
                "system 里目前可以用的 {{}} 变量（只有两个）"),
              h("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } },
                variableCard("{{model}}", "模型型号", "当前会话实际使用的模型名，例如 deepseek-flash。"),
                variableCard("{{provider}}", "服务商 / 适配器", "当前模型的服务商标识，例如 deepseek-account、bendi-api。"),
              ),

              ruleCard("官方提示词注入规则（简版）", [
                "1. 系统提示词、persona、工具说明不会被上下文压缩。",
                "2. 工作目录、当前时间、沙箱 / 审批策略、Harness 路径、GUI 地址等是“运行时上下文”，由系统自动注入并维护，不需要写变量。",
                "3. user / assistant 条目是请求级注入：不进日志，所以不会被压缩，也不会出现在对话记录里。",
                "4. AGENTS.md 与技能目录按需注入，不走 system 提示词。",
              ], THEME.warning),

              h("div", {
                style: {
                  padding: "12px 14px",
                  borderRadius: "8px",
                  background: "rgba(255,255,255,.025)",
                  border: "1px dashed " + THEME.border,
                  fontSize: "12px",
                  color: THEME.dim,
                  lineHeight: 1.6,
                },
              },
                "示例（只写在 system 里）：",
                h("div", { style: { fontFamily: "monospace", color: THEME.ink, marginTop: "6px", whiteSpace: "pre-wrap" } },
                  "你是一个运行在 {{provider}} 平台、由 {{model}} 模型驱动的专业编程助手。请协助用户分析和解决代码问题。",
                ),
                h("div", { style: { marginTop: "6px" } },
                  "注意：当前工作目录、时间等信息由系统自动告诉模型，不需要也不支持 {{cwd}}。",
                ),
              ),
            ),
            // 底部
            h("div", {
              style: {
                padding: "12px 20px",
                borderTop: "1px solid " + THEME.border,
                display: "flex",
                justifyContent: "flex-end",
              },
            },
              h("button", {
                style: S.btnPrimary,
                onClick: () => setShowVariablesModal(false),
              }, "我知道了"),
            ),
          ),
        );
      };

      // 渲染 AI 工具配备弹窗
      const renderToolsModal = () => {
        if (!showToolsModal || !draft) return null;
        const currentEnabled = new Set(draft.enabledTools || []);

        const categories = {};
        for (const t of allTools) {
          const cat = t.category || "常用工具";
          if (!categories[cat]) categories[cat] = [];
          categories[cat].push(t);
        }

        return h("div", {
          style: S.modalOverlay,
          onClick: () => setShowToolsModal(false),
        },
          h("div", {
            style: S.modalContent,
            onClick: (e) => e.stopPropagation(),
          },
            // 弹窗头部
            h("div", {
              style: {
                padding: "16px 20px",
                borderBottom: "1px solid " + THEME.border,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              },
            },
              h("div", null,
                h("h3", { style: { margin: 0, fontSize: "16px", fontWeight: 650 } }, "AI 工具配备"),
                h("p", { style: { margin: "4px 0 0", fontSize: "12px", color: THEME.muted } }, "选择该预设会话要挂载的官方工具插件；名称与说明优先使用官方中文文案。DSH 自带工具会在下方自动过滤。"),
              ),
              h("button", {
                style: Object.assign({}, S.btnSecondary, { padding: "4px 10px", fontSize: "12px" }),
                onClick: () => setShowToolsModal(false),
              }, "✕ 关闭"),
            ),
            // 弹窗列表区域
            h("div", {
              style: {
                padding: "16px 20px",
                overflowY: "auto",
                flex: 1,
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              },
            },
              Object.entries(categories).map(([catName, tools]) => {
                return h("div", { key: catName, style: { display: "flex", flexDirection: "column", gap: "8px" } },
                  h("div", { style: { fontSize: "12px", fontWeight: 700, color: THEME.accent, letterSpacing: "0.03em" } }, catName),
                  h("div", {
                    style: {
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                      gap: "8px",
                    },
                  },
                    tools.map((tool) => {
                      const isChecked = currentEnabled.has(tool.id);
                      return h("label", {
                        key: tool.id,
                        style: {
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "10px",
                          padding: "10px 12px",
                          borderRadius: "8px",
                          border: "1px solid " + (isChecked ? THEME.accent : THEME.border),
                          background: isChecked ? "rgba(59, 130, 246, 0.08)" : THEME.panel,
                          cursor: "pointer",
                          transition: "all 0.15s",
                        },
                      },
                        h("input", {
                          type: "checkbox",
                          checked: isChecked,
                          onChange: () => toggleTool(tool.id),
                          style: { marginTop: "3px" },
                        }),
                        h("div", { style: { flex: 1, minWidth: 0 } },
                          h("div", { style: { display: "flex", alignItems: "center", gap: "6px" } },
                            h("span", { style: { fontSize: "13px", fontWeight: 600, color: THEME.ink } }, tool.name),
                            tool.isOfficial ? h("span", { style: S.badge("rgba(255,255,255,0.08)", THEME.muted) }, "官方") : null,
                          ),
                          h("div", { style: { fontSize: "11px", color: THEME.muted, marginTop: "2px", lineHeight: 1.4 } }, tool.description),
                        ),
                      );
                    }),
                  ),
                );
              }),
              // 宿主级工具说明（不可勾选）
              // 其它插件在运行时提供的工具（只读展示；DSH 自带工具已过滤）
              h("div", {
                style: {
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px dashed " + THEME.border,
                  background: "rgba(255,255,255,.02)",
                  fontSize: "11.5px",
                  color: THEME.muted,
                  lineHeight: 1.6,
                },
              },
                h("div", { style: { fontWeight: 700, color: THEME.ink, marginBottom: "4px" } },
                  `其它插件提供的工具（运行中，只读）${filteredDshCount > 0 ? ` · 已过滤 ${filteredDshCount} 个 DSH 自带工具` : ""}`,
                ),
                h("div", null,
                  "这些工具由已启用的其它插件在运行时提供，已经在会话里可用；不需要也不能在这个预设里单独勾选。",
                ),
                runtimeTools.length === 0
                  ? h("div", { style: { marginTop: "6px", color: THEME.dim } }, "当前没有检测到其它插件提供的工具。")
                  : h("div", { style: { display: "flex", flexDirection: "column", gap: "6px", marginTop: "6px" } },
                      runtimeTools.map((tool) => h("div", {
                        key: tool.name,
                        style: {
                          padding: "6px 8px",
                          borderRadius: "6px",
                          background: "rgba(255,255,255,.025)",
                          border: "1px solid " + THEME.borderLight,
                        },
                      },
                        h("code", { style: { fontSize: "11.5px", color: THEME.accent, fontWeight: 700 } }, tool.name),
                        tool.description ? h("div", { style: { fontSize: "11px", marginTop: "2px", color: THEME.dim } }, tool.description) : null,
                      )),
                    ),
              ),
            ),
            // 弹窗底部
            h("div", {
              style: {
                padding: "12px 20px",
                borderTop: "1px solid " + THEME.border,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              },
            },
              h("span", { style: { fontSize: "12px", color: THEME.muted } }, `已选 ${currentEnabled.size} 项工具`),
              h("button", {
                style: S.btnPrimary,
                onClick: () => setShowToolsModal(false),
              }, "完成配置"),
            ),
          ),
        );
      };

      // 渲染新建/编辑页面
      const renderEditOrCreateView = () => {
        if (!draft) return null;
        const isCreate = view === "create";
        const pageTitle = isCreate ? "新建预设" : `编辑预设 - ${draft.name || draft.id}`;

        return h("div", { style: { display: "flex", flexDirection: "column", gap: "18px" } },
          // 页面顶端模板变量规则警示横幅
          h("div", { style: S.warningBanner },
            h("span", { style: { fontSize: "16px", flexShrink: 0 } }, "⚠️"),
            h("div", null,
              h("strong", null, "模板变量规则："),
              " system 里只支持 {{model}}、{{provider}} 两个变量；写其他 {{...}}（例如 {{cwd}}）会让整个预设报错。工作目录、时间、沙箱等信息由 DSH 自动注入，不需要写变量。",
            ),
          ),

          // 顶部标题与操作栏
          h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" } },
            h("h2", { style: { margin: 0, fontSize: "18px", fontWeight: 700 } }, pageTitle),
            h("div", { style: { display: "flex", alignItems: "center", gap: "10px" } },
              // AI 工具按钮
              h("button", {
                style: S.btnTools,
                onClick: () => setShowToolsModal(true),
              }, `⚙ AI工具 (${(draft.enabledTools || []).length})`),
              // 保存按钮
              h("button", {
                style: S.btnPrimary,
                disabled: busy,
                onClick: handleSave,
              }, busy ? "保存中…" : "保存预设"),
              // 取消按钮
              h("button", {
                style: S.btnSecondary,
                onClick: handleCancel,
              }, "取消"),
              // 编辑视图特有：导出与删除
              !isCreate ? h("button", {
                style: S.btnSecondary,
                onClick: () => handleExportSingle(draft.id, draft.name),
              }, "导出预设") : null,
              !isCreate ? (deleteConfirmId === draft.id
                ? h("div", { style: { display: "inline-flex", gap: "4px" } },
                  h("button", {
                    style: Object.assign({}, S.btnDanger, { padding: "7px 12px" }),
                    onClick: () => handleDelete(draft.id),
                  }, "确认删除"),
                  h("button", {
                    style: S.btnSecondary,
                    onClick: () => setDeleteConfirmId(null),
                  }, "取消"),
                )
                : h("button", {
                  style: S.btnDanger,
                  onClick: () => setDeleteConfirmId(draft.id),
                }, "删除预设")
              ) : null,
            ),
          ),

          // 基本属性输入卡片
          h("div", { style: S.card },
            h("div", {
              style: {
                display: "grid",
                gridTemplateColumns: isCreate ? "1fr 1.5fr" : "1fr 1.5fr",
                gap: "12px",
              },
            },
              h("div", null,
                h("label", { style: { display: "block", fontSize: "12px", color: THEME.muted, marginBottom: "5px" } }, "预设 ID (唯一英文标识)"),
                h("input", {
                  style: Object.assign({}, S.input, !isCreate ? { opacity: 0.7, cursor: "not-allowed" } : {}),
                  value: draft.id,
                  disabled: !isCreate,
                  placeholder: "如: code-master, translator",
                  onChange: (e) => updateDraftField("id", e.target.value),
                }),
              ),
              h("div", null,
                h("label", { style: { display: "block", fontSize: "12px", color: THEME.muted, marginBottom: "5px" } }, "预设显示名称"),
                h("input", {
                  style: S.input,
                  value: draft.name,
                  placeholder: "如: 代码重构专家、沉浸式翻译助手",
                  onChange: (e) => updateDraftField("name", e.target.value),
                }),
              ),
            ),
            h("div", null,
              h("label", { style: { display: "block", fontSize: "12px", color: THEME.muted, marginBottom: "5px" } }, "预设描述"),
              h("input", {
                style: S.input,
                value: draft.description,
                placeholder: "简要说明该预设的定位与应用场景",
                onChange: (e) => updateDraftField("description", e.target.value),
              }),
            ),
          ),

          // 默认模型绑定（可选）：预设生效且会话尚未显式选择模型时套用
          (() => {
            const providers = (modelCatalog && modelCatalog.providers) || [];
            const bound = draft.model && typeof draft.model === "object" ? draft.model : null;
            const boundProviderId = bound && bound.provider ? bound.provider : "";
            const providerEntry = providers.find((p) => p.id === boundProviderId);
            const modelOptions = providerEntry ? providerEntry.models || [] : [];
            const modelEntry = modelOptions.find((m) => m.id === (bound && bound.model));
            const effortOptions =
              (modelEntry && modelEntry.reasoning && modelEntry.reasoning.efforts) || [];
            const setModel = (next) => updateDraftField("model", next);
            const defaultSelection =
              (modelCatalog && modelCatalog.default) || null;
            const labelStyle = {
              display: "block",
              fontSize: "12px",
              color: THEME.muted,
              marginBottom: "5px",
            };
            return h("div", { style: S.card },
              h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "8px" } },
                h("div", { style: { flex: 1, minWidth: "260px" } },
                  h("div", { style: { fontSize: "14px", fontWeight: 650, color: THEME.ink } }, "默认模型与思考强度（可选）"),
                  h("div", { style: { fontSize: "12px", color: THEME.muted, marginTop: "4px", lineHeight: 1.6 } },
                    "当会话使用这个预设、且还没有显式选择模型时，自动切换到这里的上游模型 / 思考强度。模型列表来自 DSH 当前已配置的上游。",
                    defaultSelection
                      ? "（DSH 当前默认：" +
                        defaultSelection.provider +
                        "/" +
                        defaultSelection.model +
                        (defaultSelection.reasoningEffort
                          ? " · " + defaultSelection.reasoningEffort
                          : "") +
                        "）"
                      : "",
                  ),
                ),
                h("div", { style: { display: "flex", gap: "8px", alignItems: "center" } },
                  modelBusy
                    ? h("span", { style: { fontSize: "12px", color: THEME.muted } }, "读取模型目录…")
                    : null,
                  h("button", { style: S.btnSecondary, onClick: loadModels }, "刷新模型"),
                  bound ? h("button", { style: S.btnSecondary, onClick: () => setModel(null) }, "清空绑定") : null,
                ),
              ),
              h("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" } },
                h("div", null,
                  h("label", { style: labelStyle }, "上游 Provider"),
                  h("select", {
                    style: S.input,
                    value: boundProviderId,
                    onChange: (e) => {
                      const providerId = e.target.value;
                      if (!providerId) {
                        setModel(null);
                        return;
                      }
                      const firstModel =
                        (providers.find((p) => p.id === providerId) || {}).models?.[0];
                      setModel(
                        firstModel
                          ? { provider: providerId, model: firstModel.id }
                          : { provider: providerId, model: "" },
                      );
                    },
                  },
                    h("option", { value: "" }, "不绑定（跟随 DSH 默认）"),
                    providers.map((p) => h("option", { key: p.id, value: p.id },
                      (p.name || p.id) + "（" + p.id + "）")),
                  ),
                ),
                h("div", null,
                  h("label", { style: labelStyle }, "模型"),
                  h("select", {
                    style: S.input,
                    value: (bound && bound.model) || "",
                    disabled: !providerEntry,
                    onChange: (e) => {
                      const modelId = e.target.value;
                      if (!modelId) {
                        setModel(bound ? { ...bound, model: "" } : null);
                        return;
                      }
                      const entry = modelOptions.find((m) => m.id === modelId);
                      const defaultEffortClass =
                        entry && entry.reasoning && entry.reasoning.defaultEffort
                          ? entry.reasoning.defaultEffort
                          : "";
                      setModel({
                        provider: boundProviderId,
                        model: modelId,
                        ...(defaultEffortClass
                          ? { reasoningEffort: defaultEffortClass }
                          : {}),
                      });
                    },
                  },
                    h("option", { value: "" }, providerEntry ? "选择模型…" : "先选择上游"),
                    modelOptions.map((m) => h("option", { key: m.id, value: m.id },
                      (m.name || m.id) + "（" + m.id + "）")),
                  ),
                ),
                h("div", null,
                  h("label", { style: labelStyle }, "思考强度"),
                  h("select", {
                    style: S.input,
                    value: (bound && bound.reasoningEffort) || "",
                    disabled: effortOptions.length === 0,
                    onChange: (e) => {
                      const effort = e.target.value;
                      setModel({
                        provider: boundProviderId,
                        model: (bound && bound.model) || "",
                        ...(effort ? { reasoningEffort: effort } : {}),
                      });
                    },
                  },
                    h("option", { value: "" },
                      effortOptions.length ? "跟随模型默认" : "该模型无思考强度选项"),
                    effortOptions.map((effort) => h("option", { key: effort.id, value: effort.id },
                      (effort.name || effort.id) + "（" + effort.id + "）")),
                  ),
                ),
              ),
              modelCatalog && bound && (!providerEntry || !modelEntry)
                ? h("div", { style: Object.assign({}, S.warningBanner, { fontSize: "12px" }) },
                    "当前绑定的上游 / 模型已不在 DSH 模型目录里；运行时会跳过绑定并回退会话当前模型，建议重新选择。")
                : null,
            );
          })(),

          // 消息条目编排区域
          h("div", { style: { display: "flex", flexDirection: "column", gap: "12px" } },
            h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
              h("div", null,
                h("span", { style: { fontSize: "14px", fontWeight: 650 } }, "提示词模板与对话前置编排"),
                h("span", { style: { fontSize: "12px", color: THEME.muted, marginLeft: "8px" } }, "（顶级必须为启用的 system，其余消息类型与位置可自由增删调序）"),
              ),
              h("div", { style: { display: "flex", gap: "6px" } },
                h("button", {
                  style: Object.assign({}, S.btnSecondary, { padding: "5px 10px", fontSize: "12px", color: THEME.roleSys }),
                  onClick: () => addEntry("system"),
                }, "+ system"),
                h("button", {
                  style: Object.assign({}, S.btnSecondary, { padding: "5px 10px", fontSize: "12px", color: THEME.roleUser }),
                  onClick: () => addEntry("user"),
                }, "+ user"),
                h("button", {
                  style: Object.assign({}, S.btnSecondary, { padding: "5px 10px", fontSize: "12px", color: THEME.roleAssistant }),
                  onClick: () => addEntry("assistant"),
                }, "+ assistant"),
              ),
            ),

            // 消息列表
            draft.entries.map((entry, idx) => {
              const isFirst = idx === 0; // 顶级首条
              const isLast = idx === draft.entries.length - 1;
              const currentRole = ROLE_OPTIONS.find((r) => r.key === entry.role) || ROLE_OPTIONS[0];

              return h("div", {
                key: entry.id || idx,
                style: Object.assign({}, S.card, {
                  gap: "10px",
                  padding: "14px",
                  borderLeft: `4px solid ${currentRole.color}`,
                  opacity: entry.enabled ? 1 : 0.6,
                }),
              },
                // 条目头部控制栏
                h("div", { style: { display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" } },
                  h("span", { style: { fontSize: "12px", fontWeight: 700, color: THEME.dim } }, `#${idx + 1}`),
                  // 角色选择下拉（顶级首条固定为 system，不可修改）
                  h("select", {
                    style: {
                      padding: "5px 10px",
                      borderRadius: "6px",
                      border: "1px solid " + THEME.border,
                      background: "var(--dsw-alias-bg-layer-2, rgba(255,255,255,.06))",
                      color: currentRole.color,
                      fontWeight: 700,
                      fontSize: "12px",
                      cursor: isFirst ? "not-allowed" : "pointer",
                      outline: "none",
                      opacity: isFirst ? 0.8 : 1,
                    },
                    value: entry.role,
                    disabled: isFirst,
                    title: isFirst ? "顶级第一条必须固定为 system" : undefined,
                    onChange: (e) => updateEntry(idx, { role: e.target.value }),
                  },
                    ROLE_OPTIONS.map((r) => h("option", { key: r.key, value: r.key }, r.label)),
                  ),
                  // 状态开关（顶级第一条必须为启用状态，不可关闭）
                  h("label", {
                    style: {
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                      fontSize: "12px",
                      color: entry.enabled ? THEME.ink : THEME.dim,
                      cursor: isFirst ? "not-allowed" : "pointer",
                      userSelect: "none",
                      opacity: isFirst ? 0.8 : 1,
                    },
                  },
                    h("input", {
                      type: "checkbox",
                      checked: entry.enabled,
                      disabled: isFirst,
                      title: isFirst ? "顶级 system 必须处于启用状态" : undefined,
                      onChange: (e) => updateEntry(idx, { enabled: e.target.checked }),
                    }),
                    isFirst ? "必须启用 (顶级)" : (entry.enabled ? "启用" : "已停用"),
                  ),
                  // 右侧调序与删除按钮组（顶级首条不能上移、下移或删除）
                  h("div", { style: { marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px" } },
                    h("button", {
                      style: Object.assign({}, S.btnSecondary, { padding: "3px 8px", fontSize: "12px" }, (isFirst || idx === 1) ? { opacity: 0.3, cursor: "not-allowed" } : {}),
                      disabled: isFirst || idx === 1, // 不能越过第 0 位的顶级 system
                      title: isFirst ? "顶级条目不可移动" : (idx === 1 ? "不可越过顶级 system" : "向上移动位置"),
                      onClick: () => moveEntry(idx, -1),
                    }, "↑ 上移"),
                    h("button", {
                      style: Object.assign({}, S.btnSecondary, { padding: "3px 8px", fontSize: "12px" }, (isFirst || isLast) ? { opacity: 0.3, cursor: "not-allowed" } : {}),
                      disabled: isFirst || isLast,
                      title: isFirst ? "顶级 system 位置固定在首位" : "向下移动位置",
                      onClick: () => moveEntry(idx, 1),
                    }, "↓ 下移"),
                    h("button", {
                      style: Object.assign({}, S.btnSecondary, { padding: "3px 8px", fontSize: "12px", color: THEME.danger }, isFirst ? { opacity: 0.3, cursor: "not-allowed" } : {}),
                      disabled: isFirst,
                      title: isFirst ? "顶级 system 不可删除" : "删除本条消息",
                      onClick: () => removeEntry(idx),
                    }, "删除"),
                  ),
                ),
                // 文本内容输入框
                h("textarea", {
                  style: S.textarea,
                  value: entry.text,
                  placeholder: entry.role === "system"
                    ? "输入 system 系统提示词（支持 {{model}}、{{provider}} 变量；工作目录等由系统自动注入）..."
                    : entry.role === "user"
                    ? "输入 user 消息..."
                    : "输入 assistant 消息...",
                  onChange: (e) => updateEntry(idx, { text: e.target.value }),
                }),
              );
            }),

            // 底部快速添加按钮
            h("div", { style: { display: "flex", justifyContent: "center", marginTop: "4px" } },
              h("button", {
                style: Object.assign({}, S.btnSecondary, { width: "100%", padding: "10px", borderStyle: "dashed" }),
                onClick: () => addEntry("user"),
              }, "+ 添加新消息条目"),
            ),
          ),
        );
      };

      return h("div", { style: S.container },
        renderHeader(),
        view === "current"
          ? renderCurrentView()
          : view === "projects"
          ? renderProjectsView()
          : renderEditOrCreateView(),
        renderToolsModal(),
        renderVariablesModal(),
      );
    }

    function apply(ctx) {
      clientCtx = ctx;
      // 可选依赖：官方工作区服务提供原生目录选择器；不存在时设置页仍可手动输入路径。
      try {
        ctx.inject(["uiWorkspace"], (child) => {
          directoryPicker = {
            pick: () => child.uiWorkspace.pickDirectory(),
          };
        });
      } catch (error) {
        console.warn("[dsh-preset-editor] uiWorkspace unavailable; directory picker disabled:", error);
      }
      ctx.slots.inject("settings.section", () =>
        ctx.slots.register({
          name: "settings.section",
          id: "dsh-preset-editor",
          order: 40,
          label: () => "预设编辑",
        }, () => h(PresetEditorMain, null)),
      );
    }

    exports.name = name;
    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  },
});
