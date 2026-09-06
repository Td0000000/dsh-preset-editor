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
      accentHover: "var(--dsw-alias-brand-hover, #2563eb)",
      danger: "var(--dsw-alias-state-error-primary, #ef4444)",
      dangerBg: "rgba(239, 68, 68, 0.12)",
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
        border: "1px solid " + (active ? THEME.accent : THEME.border),
        background: active ? THEME.accent : THEME.panel,
        color: active ? "#ffffff" : THEME.ink,
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
        background: THEME.accent,
        color: "#ffffff",
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
        background: "var(--dsw-alias-bg-layer-4, #18191d)",
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
    };

    const ROLE_OPTIONS = [
      { key: "system", label: "SYS", desc: "系统提示词", color: THEME.roleSys },
      { key: "user", label: "USER", desc: "用户破限/引导", color: THEME.roleUser },
      { key: "assistant", label: "ASSISTANT", desc: "助理伪装前置", color: THEME.roleAssistant },
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

    function PresetEditorMain() {
      // 视图状态: 'current' (预设列表) | 'edit' (编辑页面) | 'create' (新建页面)
      const [view, setView] = useState("current");
      const [doc, setDoc] = useState(null);
      const [allTools, setAllTools] = useState([]);
      const [notice, setNotice] = useState({ kind: "idle", text: "" });
      const [busy, setBusy] = useState(false);

      // 编辑/新建预设草稿
      const [draft, setDraft] = useState(null);
      const [showToolsModal, setShowToolsModal] = useState(false);
      const [deleteConfirmId, setDeleteConfirmId] = useState(null);

      const fileInputRef = useRef(null);

      // 加载所有预设与状态
      const loadState = useCallback(() => {
        setBusy(true);
        fetch("/dsh-preset-editor/state", { cache: "no-store" })
          .then((r) => r.json())
          .then((d) => {
            if (d.ok) {
              setDoc(d.doc);
            } else {
              setNotice({ kind: "error", text: "读取预设失败: " + (d.error || "") });
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
            }
          })
          .catch(() => {});
      }, []);

      useEffect(() => {
        loadState();
        loadTools();
      }, [loadState, loadTools]);

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
        setDraft({
          id: "",
          name: "",
          description: "",
          enabledTools: defaultToolIds.length > 0 ? defaultToolIds : ["tool-bash", "tool-pwsh", "tool-fs", "tool-fs-search", "tool-web", "tool-skill", "tool-ask-user", "tool-todo"],
          entries: [
            { id: "e-1", role: "system", text: "You are a helpful coding assistant.", enabled: true },
            { id: "e-2", role: "user", text: "请以专业标准协助我完成任务。", enabled: true },
            { id: "e-3", role: "assistant", text: "收到，请说明具体需求，我将提供清晰详尽的方案与代码实现。", enabled: true },
          ],
        });
        setView("create");
        setNotice({ kind: "idle", text: "" });
      };

      // 进入编辑预设页面
      const handleOpenEdit = (preset) => {
        setDraft(JSON.parse(JSON.stringify(preset)));
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

        setBusy(true);
        fetch("/dsh-preset-editor/save", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ preset: { ...draft, id: idClean } }),
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

      // 草稿消息条目操作
      const updateDraftField = (key, val) => {
        setDraft((prev) => ({ ...prev, [key]: val }));
      };

      const updateEntry = (idx, patch) => {
        setDraft((prev) => {
          const entries = prev.entries.map((e, i) => (i === idx ? { ...e, ...patch } : e));
          return { ...prev, entries };
        });
      };

      const addEntry = (role = "system") => {
        setDraft((prev) => ({
          ...prev,
          entries: [
            ...prev.entries,
            { id: "e-" + Date.now(), role, text: "", enabled: true },
          ],
        }));
      };

      const removeEntry = (idx) => {
        setDraft((prev) => ({
          ...prev,
          entries: prev.entries.filter((_, i) => i !== idx),
        }));
      };

      const moveEntry = (idx, dir) => {
        setDraft((prev) => {
          const targetIdx = idx + dir;
          if (targetIdx < 0 || targetIdx >= prev.entries.length) return prev;
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
          h("p", { style: S.subtitle }, "可视化编辑预设，选择一个预设并保存，新对话即可生效。"),
          h("hr", { style: S.divider }),
          h("div", { style: S.navBar },
            h("button", {
              style: S.navButton(view === "current"),
              onClick: () => { setView("current"); setDraft(null); },
            }, "当前预设"),
            h("button", {
              style: S.navButton(view === "create"),
              onClick: handleOpenCreate,
            }, "+ 新建预设"),
            h("button", {
              style: S.navButton(false),
              onClick: handleImportClick,
            }, "导入预设"),
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

      // 渲染当前预设列表视图
      const renderCurrentView = () => {
        if (!doc) {
          return h("p", { style: { color: THEME.muted, fontSize: "13px" } }, "正在读取预设…");
        }

        if (presetsList.length === 0) {
          return h("div", { style: Object.assign({}, S.card, { alignItems: "center", padding: "40px 20px" }) },
            h("p", { style: { color: THEME.muted, fontSize: "14px", margin: "0 0 14px" } }, "暂无任何自定义预设"),
            h("button", { style: S.btnPrimary, onClick: handleOpenCreate }, "创建第一个预设"),
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
                  h("span", { style: S.badge("rgba(59, 130, 246, 0.12)", THEME.roleSys) }, `SYS: ${sysCount}`),
                  h("span", { style: S.badge("rgba(16, 185, 129, 0.12)", THEME.roleUser) }, `USER: ${userCount}`),
                  h("span", { style: S.badge("rgba(139, 92, 246, 0.12)", THEME.roleAssistant) }, `ASSISTANT: ${asstCount}`),
                  h("span", { style: { fontSize: "11px", color: THEME.dim, marginLeft: "auto" } }, `总计 ${(p.entries || []).length} 条消息`),
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
        );
      };

      // 渲染 AI 工具配备弹窗
      const renderToolsModal = () => {
        if (!showToolsModal || !draft) return null;
        const currentEnabled = new Set(draft.enabledTools || []);

        // 工具按分类归集
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
                h("p", { style: { margin: "4px 0 0", fontSize: "12px", color: THEME.muted } }, "选择该预设会话在启动时所携带的工具插件（包含官方所有内置工具及已装扩展）"),
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

          // 消息条目编排区域
          h("div", { style: { display: "flex", flexDirection: "column", gap: "12px" } },
            h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
              h("div", null,
                h("span", { style: { fontSize: "14px", fontWeight: 650 } }, "提示词模板与对话前置编排"),
                h("span", { style: { fontSize: "12px", color: THEME.muted, marginLeft: "8px" } }, "（支持 SYS、USER、ASSISTANT 三类消息，位置完全可上下拖动调整）"),
              ),
              h("div", { style: { display: "flex", gap: "6px" } },
                h("button", {
                  style: Object.assign({}, S.btnSecondary, { padding: "5px 10px", fontSize: "12px", color: THEME.roleSys }),
                  onClick: () => addEntry("system"),
                }, "+ SYS"),
                h("button", {
                  style: Object.assign({}, S.btnSecondary, { padding: "5px 10px", fontSize: "12px", color: THEME.roleUser }),
                  onClick: () => addEntry("user"),
                }, "+ USER"),
                h("button", {
                  style: Object.assign({}, S.btnSecondary, { padding: "5px 10px", fontSize: "12px", color: THEME.roleAssistant }),
                  onClick: () => addEntry("assistant"),
                }, "+ ASSISTANT"),
              ),
            ),

            // 消息列表
            draft.entries.map((entry, idx) => {
              const isFirst = idx === 0;
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
                  // 角色选择下拉
                  h("select", {
                    style: {
                      padding: "5px 10px",
                      borderRadius: "6px",
                      border: "1px solid " + THEME.border,
                      background: "var(--dsw-alias-bg-layer-2, rgba(255,255,255,.06))",
                      color: currentRole.color,
                      fontWeight: 700,
                      fontSize: "12px",
                      cursor: "pointer",
                      outline: "none",
                    },
                    value: entry.role,
                    onChange: (e) => updateEntry(idx, { role: e.target.value }),
                  },
                    ROLE_OPTIONS.map((r) => h("option", { key: r.key, value: r.key }, `${r.label} (${r.desc})`)),
                  ),
                  // 状态开关
                  h("label", {
                    style: {
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                      fontSize: "12px",
                      color: entry.enabled ? THEME.ink : THEME.dim,
                      cursor: "pointer",
                      userSelect: "none",
                    },
                  },
                    h("input", {
                      type: "checkbox",
                      checked: entry.enabled,
                      onChange: (e) => updateEntry(idx, { enabled: e.target.checked }),
                    }),
                    entry.enabled ? "启用" : "已停用",
                  ),
                  // 右侧调序与删除按钮组
                  h("div", { style: { marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px" } },
                    h("button", {
                      style: Object.assign({}, S.btnSecondary, { padding: "3px 8px", fontSize: "12px" }, isFirst ? { opacity: 0.3, cursor: "not-allowed" } : {}),
                      disabled: isFirst,
                      title: "向上移动位置",
                      onClick: () => moveEntry(idx, -1),
                    }, "↑ 上移"),
                    h("button", {
                      style: Object.assign({}, S.btnSecondary, { padding: "3px 8px", fontSize: "12px" }, isLast ? { opacity: 0.3, cursor: "not-allowed" } : {}),
                      disabled: isLast,
                      title: "向下移动位置",
                      onClick: () => moveEntry(idx, 1),
                    }, "↓ 下移"),
                    h("button", {
                      style: Object.assign({}, S.btnSecondary, { padding: "3px 8px", fontSize: "12px", color: THEME.danger }),
                      title: "删除本条消息",
                      onClick: () => removeEntry(idx),
                    }, "删除"),
                  ),
                ),
                // 文本内容输入框
                h("textarea", {
                  style: S.textarea,
                  value: entry.text,
                  placeholder: entry.role === "system"
                    ? "输入系统主提示词（System Prompt）..."
                    : entry.role === "user"
                    ? "输入预设用户消息（引导词 / 规则约束 / 破限触发）..."
                    : "输入预设模型回复伪装消息（Assistant Pre-fill 种子消息）...",
                  onChange: (e) => updateEntry(idx, { text: e.target.value }),
                }),
              );
            }),

            // 底部快速添加按钮
            h("div", { style: { display: "flex", justifyContent: "center", marginTop: "4px" } },
              h("button", {
                style: Object.assign({}, S.btnSecondary, { width: "100%", padding: "10px", borderStyle: "dashed" }),
                onClick: () => addEntry("system"),
              }, "+ 添加新消息条目"),
            ),
          ),
        );
      };

      return h("div", { style: S.container },
        renderHeader(),
        view === "current" ? renderCurrentView() : renderEditOrCreateView(),
        renderToolsModal(),
      );
    }

    function apply(ctx) {
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
