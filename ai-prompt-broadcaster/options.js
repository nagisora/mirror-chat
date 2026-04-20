document.addEventListener("DOMContentLoaded", async () => {
  const OPENROUTER_TEST_ATTEMPT_LIMIT = 4;

  const baseUrlInput = document.getElementById("obsidian-base-url");
  const tokenInput = document.getElementById("obsidian-token");
  const rootPathInput = document.getElementById("obsidian-root-path");
  const digestProviderInput = document.getElementById("digest-provider");
  const openRouterApiKeyInput = document.getElementById("openrouter-api-key");
  const openCodeZenApiKeyInput = document.getElementById("opencodezen-api-key");
  const openRouterPreferredModelInput = document.getElementById("openrouter-preferred-model");
  const openRouterRefreshButton = document.getElementById("openrouter-refresh-models-button");
  const openRouterRefreshStatus = document.getElementById("openrouter-refresh-status");
  const openRouterRefreshMeta = document.getElementById("openrouter-refresh-meta");
  const openRouterTestModelInput = document.getElementById("openrouter-test-model");
  const openRouterTestButton = document.getElementById("openrouter-test-button");
  const openRouterTestCopyButton = document.getElementById("openrouter-test-copy-button");
  const openRouterTestStatus = document.getElementById("openrouter-test-status");
  const openRouterTestLog = document.getElementById("openrouter-test-log");
  const saveButton = document.getElementById("save-button");
  const status = document.getElementById("status");
  const aiOrderList = document.getElementById("ai-order-list");
  const aiConfigList = document.getElementById("ai-config-list");

  const storage = window.MirrorChatStorage;
  const openRouterFreeModels = self.MirrorChatOpenRouterFreeModels;
  const openCodeZenFreeModels = self.MirrorChatOpenCodeZenFreeModels;
  const digestService = self.MirrorChatDigestService;
  const constants = window.MirrorChatConstants || {};
  // DOM 参照（provider非依存 един интерфейс）
  const AI_DEFAULT_ORDER = constants.AI_DEFAULT_ORDER || ["gemini", "chatgpt", "claude", "grok"];
  const AI_CONFIG_DEFAULTS = constants.AI_CONFIG_DEFAULTS || {};
  const aiOrderUtils = window.MirrorChatAIOrderUtils;
  const normalizeAiOrder = aiOrderUtils.normalizeAiOrder;
  const MESSAGE_TYPES = window.MirrorChatConstants?.MESSAGE_TYPES || {};
  const MSG_RETRY = MESSAGE_TYPES.RETRY || "MIRRORCHAT_RETRY";

  let currentAiOrder = normalizeAiOrder(AI_DEFAULT_ORDER);

  function getAiDisplayName(aiKey) {
    return AI_CONFIG_DEFAULTS?.[aiKey]?.name || aiKey;
  }

  function applyAiOrderToConfigSections(aiOrder) {
    if (!aiConfigList) return;
    normalizeAiOrder(aiOrder).forEach((aiKey) => {
      const section = aiConfigList.querySelector(`.ai-config[data-ai="${aiKey}"]`);
      if (section) aiConfigList.appendChild(section);
    });
  }

  function moveAiOrder(aiKey, offset) {
    const index = currentAiOrder.indexOf(aiKey);
    if (index === -1) return;
    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= currentAiOrder.length) return;
    const updated = [...currentAiOrder];
    const [item] = updated.splice(index, 1);
    updated.splice(nextIndex, 0, item);
    currentAiOrder = updated;
    renderAiOrderList();
    applyAiOrderToConfigSections(currentAiOrder);
  }

  function renderAiOrderList() {
    if (!aiOrderList) return;
    aiOrderList.innerHTML = "";
    currentAiOrder.forEach((aiKey, index) => {
      const item = document.createElement("li");
      item.className = "ai-order-item";
      item.dataset.ai = aiKey;

      const name = document.createElement("span");
      name.className = "ai-order-name";
      name.textContent = getAiDisplayName(aiKey);

      const controls = document.createElement("div");
      controls.className = "ai-order-controls";

      const upButton = document.createElement("button");
      upButton.type = "button";
      upButton.className = "ai-order-button";
      upButton.dataset.action = "up";
      upButton.dataset.ai = aiKey;
      upButton.textContent = "↑";
      upButton.disabled = index === 0;
      upButton.setAttribute("aria-label", `${getAiDisplayName(aiKey)} を上へ移動`);

      const downButton = document.createElement("button");
      downButton.type = "button";
      downButton.className = "ai-order-button";
      downButton.dataset.action = "down";
      downButton.dataset.ai = aiKey;
      downButton.textContent = "↓";
      downButton.disabled = index === currentAiOrder.length - 1;
      downButton.setAttribute("aria-label", `${getAiDisplayName(aiKey)} を下へ移動`);

      controls.appendChild(upButton);
      controls.appendChild(downButton);
      item.appendChild(name);
      item.appendChild(controls);
      aiOrderList.appendChild(item);
    });
  }

  function setOpenRouterTestStatus(text, tone = "info") {
    openRouterTestStatus.textContent = text;
    openRouterTestStatus.dataset.tone = tone;
  }

  function setOpenRouterTestButtonsDisabled(disabled) {
    openRouterTestButton.disabled = disabled;
    openRouterTestCopyButton.disabled = disabled;
  }

  function truncateText(text, maxLength = 240) {
    const normalized = String(text || "").trim();
    if (!normalized || normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, Math.max(0, maxLength - 20)).trimEnd()} ... (${normalized.length} chars)`;
  }

  function formatJsonForLog(value, maxLength = 2400) {
    const serialized = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    if (!serialized) return "";
    if (serialized.length <= maxLength) return serialized;
    return `${serialized.slice(0, maxLength).trimEnd()}\n... [truncated ${serialized.length - maxLength} chars]`;
  }

  function indentText(text, prefix = "  ") {
    return String(text || "")
      .split("\n")
      .map((line) => `${prefix}${line}`)
      .join("\n");
  }

  function populateTestModelSuggestions(settings) {
    const provider = digestService.resolveProvider(settings);
    const freeModelSelector = provider.name === "opencodezen"
      ? openCodeZenFreeModels
      : openRouterFreeModels;
    const candidates = freeModelSelector.buildKnownFreeModelList({
      preferredModel: provider.preferredModel,
      candidates: provider.freeModelCandidatesOverride
    });
    const currentValue = openRouterTestModelInput.value;
    openRouterTestModelInput.innerHTML = "";

    const autoOption = document.createElement("option");
    autoOption.value = "";
    autoOption.textContent = "自動候補順で診断";
    openRouterTestModelInput.appendChild(autoOption);

    candidates.forEach((modelId) => {
      const option = document.createElement("option");
      option.value = modelId;
      option.textContent = modelId;
      openRouterTestModelInput.appendChild(option);
    });

    const values = new Set(["", ...candidates]);
    openRouterTestModelInput.value = values.has(currentValue) ? currentValue : "";
  }

  async function runOpenRouterDiagnostic() {
    const settings = await storage.getSettings();
    const provider = digestService.resolveProvider(settings);
    if (!provider.apiKey) {
      setOpenRouterTestStatus(`${provider.name} の API キーを入力してください。`, "error");
      openRouterTestLog.textContent = "API キーが未設定のため診断を開始できません。";
      return;
    }

    const prompt = digestService?.buildDigestDiagnosticPrompt
      ? digestService.buildDigestDiagnosticPrompt()
      : {
          systemPrompt: "複数AI回答を日本語で短く整理してください。Markdownのみで出力してください。",
          userPrompt: "## 質問\nMirrorChat の digest 診断です。\n\n## 各AI回答\n### ChatGPT\n- 要点A\n\n### Claude\n- 観点B"
        };
    const logLines = [];
    const appendLog = (line = "") => {
      logLines.push(line);
      openRouterTestLog.textContent = logLines.join("\n");
      openRouterTestLog.scrollTop = openRouterTestLog.scrollHeight;
    };

    setOpenRouterTestButtonsDisabled(true);
    setOpenRouterTestStatus(`${provider.name} digest API をテスト中...`, "info");
    openRouterTestLog.textContent = "";

    try {
      appendLog(`[開始] ${new Date().toLocaleString("ja-JP")}`);
      appendLog(
        `[設定] provider=${provider.name} / preferredModel=${provider.preferredModel || "(自動選択)"} / ` +
        `testModel=${openRouterTestModelInput.value.trim() || "(自動候補順)"}`
      );
      const diagnosticRun = await digestService.runDigestPrompt({
        prompt,
        settings,
        fetchImpl: fetch,
        attemptLimit: OPENROUTER_TEST_ATTEMPT_LIMIT
      });
      const runtime = diagnosticRun?.candidateResolution?.runtime || {};
      appendLog(
        `[リクエスト] timeout=${runtime.timeoutMs || 0}ms / systemPrompt=${prompt.systemPrompt.length} chars / userPrompt=${prompt.userPrompt.length} chars`
      );

      if (diagnosticRun.candidateResolution?.source === "catalog") {
        appendLog(
          `[候補取得] 成功: catalog=${diagnosticRun.refreshedStats?.catalogCount ?? 0}件 / 診断候補=${diagnosticRun.candidateResolution?.attemptedCandidates?.length ?? 0}件`
        );
      } else {
        appendLog(
          `[候補取得] 保存済み/既定候補で続行: ${diagnosticRun.candidateResolution?.attemptedCandidates?.length ?? 0}件`
        );
      }

      const diagnosticCandidates = Array.isArray(diagnosticRun.candidateResolution?.attemptedCandidates)
        ? diagnosticRun.candidateResolution.attemptedCandidates
        : [];
      appendLog(`[候補順] ${diagnosticCandidates.join(", ")}`);

      for (let index = 0; index < diagnosticRun.attemptResults.length; index += 1) {
        const attemptResult = diagnosticRun.attemptResults[index];
        const diagnostic = attemptResult.diagnostic;

        appendLog("");
        appendLog(`[試行 ${index + 1}/${diagnosticCandidates.length}] ${attemptResult.modelId}`);

        appendLog(
          diagnostic.response
            ? `[応答] HTTP ${diagnostic.response.status}${diagnostic.response.statusText ? ` ${diagnostic.response.statusText}` : ""}`
            : "[応答] 応答メタデータなし"
        );

        if (diagnostic.analysis) {
          const parts = [];
          if (diagnostic.analysis.model) parts.push(`model=${diagnostic.analysis.model}`);
          if (diagnostic.analysis.provider) parts.push(`provider=${diagnostic.analysis.provider}`);
          if (diagnostic.analysis.finishReason) parts.push(`finish_reason=${diagnostic.analysis.finishReason}`);
          if (diagnostic.analysis.contentKind) parts.push(`content=${diagnostic.analysis.contentKind}`);
          if (diagnostic.analysis.choiceErrorMessage) parts.push(`choice.error=${diagnostic.analysis.choiceErrorMessage}`);
          if (typeof diagnostic.analysis.reasoningTokens === "number") {
            parts.push(`reasoning_tokens=${diagnostic.analysis.reasoningTokens}`);
          }
          if (parts.length > 0) {
            appendLog(`[解析] ${parts.join(" / ")}`);
          }
        }

        if (attemptResult.ok) {
          appendLog(`[結果] 成功: ${truncateText(diagnostic.text)}`);
          break;
        }

        appendLog(`[結果] 失敗: ${attemptResult.error || "不明なエラー"}`);
        if (diagnostic.analysis?.reasoning) {
          appendLog(`[reasoning] ${truncateText(diagnostic.analysis.reasoning)}`);
        }
        if (diagnostic.payload || diagnostic.rawText) {
          appendLog("[payload]");
          appendLog(indentText(formatJsonForLog(diagnostic.payload || diagnostic.rawText)));
        }
      }

      if (diagnosticRun.ok) {
        setOpenRouterTestStatus(`テスト成功: ${diagnosticRun.modelId}`, "success");
      } else {
        if (diagnosticRun.attemptResults.length === 0) {
          appendLog("");
          appendLog(`[結果] 失敗: ${diagnosticRun.error || "不明なエラー"}`);
        }
        setOpenRouterTestStatus("全候補で失敗しました。ログを確認してください。", "error");
      }
    } catch (error) {
      setOpenRouterTestStatus("テスト実行中に予期しないエラーが発生しました。", "error");
      appendLog(`[致命的エラー] ${error instanceof Error ? error.stack || error.message : String(error)}`);
    } finally {
      setOpenRouterTestButtonsDisabled(false);
    }
  }

  async function copyOpenRouterDiagnosticLog() {
    const text = openRouterTestLog.textContent || "";
    if (!text.trim()) {
      setOpenRouterTestStatus("コピーするログがありません。", "error");
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setOpenRouterTestStatus("ログをクリップボードにコピーしました。", "success");
    } catch (error) {
      setOpenRouterTestStatus(
        `ログのコピーに失敗しました: ${error instanceof Error ? error.message : String(error)}`,
        "error"
      );
    }
  }

  function populatePreferredModelOptions(settings) {
    const provider = digestService.resolveProvider(settings);
    const freeModelSelector = provider.name === "opencodezen"
      ? openCodeZenFreeModels
      : openRouterFreeModels;
    const options = freeModelSelector.buildSelectOptions({
      preferredModel: provider.preferredModel,
      candidates: provider.freeModelCandidatesOverride
    });
    openRouterPreferredModelInput.innerHTML = "";
    options.forEach(({ value, label }) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      openRouterPreferredModelInput.appendChild(option);
    });
    openRouterPreferredModelInput.value = provider.preferredModel || "";
  }

  function formatRefreshMeta(providerSettings, providerName) {
    const candidates = providerSettings?.freeModelCandidatesOverride || [];
    const stats = providerSettings?.lastRefreshStats || {};
    const lastRefreshAt = providerSettings?.lastRefreshAt || "";
    const summary = {
      digestCandidateCount: candidates.length,
      selectableCount: candidates.length,
      freeCount: stats.freeCount ?? null,
      catalogCount: stats.catalogCount ?? null,
      digestCompatibleCount: stats.digestCompatibleCount ?? null,
      lastRefreshAt
    };
    if (candidates.length === 0 && !summary.lastRefreshAt) {
      return `更新済み候補はまだありません（${providerName} の既定候補）`;
    }
    const parts = [];
    if (summary.freeCount !== null) {
      parts.push(`free取得: ${summary.freeCount}`);
    }
    parts.push(`digest候補: ${summary.digestCandidateCount}`);
    parts.push(`プルダウン表示: ${summary.selectableCount}`);
    if (summary.lastRefreshAt) {
      parts.push(`最終更新: ${new Date(summary.lastRefreshAt).toLocaleString("ja-JP")}`);
    }
    return parts.join(" / ");
  }

  async function restore() {
    const settings = await storage.getSettings();

    currentAiOrder = normalizeAiOrder(settings.aiOrder);
    renderAiOrderList();
    applyAiOrderToConfigSections(currentAiOrder);

    baseUrlInput.value = settings.obsidian.baseUrl || "";
    tokenInput.value = settings.obsidian.token || "";
    rootPathInput.value = settings.obsidian.rootPath || "";
    digestProviderInput.value = settings.digestProvider || "";
    openRouterApiKeyInput.value = settings.openrouter?.apiKey || "";
    openCodeZenApiKeyInput.value = settings.opencodezen?.apiKey || "";
    populatePreferredModelOptions(settings);
    populateTestModelSuggestions(settings);
    const provider = digestService.resolveProvider(settings);
    openRouterRefreshMeta.textContent = formatRefreshMeta(
      provider.name === "opencodezen" ? settings.opencodezen : settings.openrouter,
      provider.name === "opencodezen" ? "OpenCode Zen" : "OpenRouter"
    );
    openRouterRefreshStatus.textContent = "";
    setOpenRouterTestStatus("", "info");
    openRouterTestLog.textContent = "";
    openRouterTestModelInput.value = "";
    setOpenRouterTestButtonsDisabled(false);

    document
      .querySelectorAll(".ai-config")
      .forEach((container) => {
        const aiKey = container.getAttribute("data-ai");
        const cfg = (settings.aiConfigs && settings.aiConfigs[aiKey]) || {};
        container.querySelector(".input-selector").value = cfg.inputSelector || "";
        container.querySelector(".submit-selector").value = cfg.submitButtonSelector || "";
        container.querySelector(".answer-selector").value = cfg.answerContainerSelector || "";
        const copyEl = container.querySelector(".copy-selector");
        if (copyEl) copyEl.value = cfg.copyButtonSelector || "";
        const doneEl = container.querySelector(".done-selector");
        if (doneEl) doneEl.value = cfg.doneCheckSelector || "";
        const submitMethodEl = container.querySelector(".submit-method-selector");
        if (submitMethodEl) {
          submitMethodEl.value = cfg.submitMethod || "clickSubmitOrEnter";
        }
        const inputSuccessFallbackEl = container.querySelector(".input-success-fallback-selector");
        if (inputSuccessFallbackEl) inputSuccessFallbackEl.value = cfg.inputSuccessFallback || "";
      });
  }

  async function save() {
    const providerValue = digestProviderInput.value.trim();
    const partial = {
      aiOrder: [...currentAiOrder],
      obsidian: {
        baseUrl: baseUrlInput.value.trim(),
        token: tokenInput.value.trim(),
        rootPath: rootPathInput.value.trim()
      },
      digestProvider: providerValue || null,
      openrouter: {
        apiKey: openRouterApiKeyInput.value.trim(),
        preferredModel: providerValue === "openrouter"
          ? (openRouterPreferredModelInput.value.trim() || null)
          : null
      },
      opencodezen: {
        apiKey: openCodeZenApiKeyInput.value.trim(),
        preferredModel: providerValue === "opencodezen"
          ? (openRouterPreferredModelInput.value.trim() || null)
          : null
      },
      aiConfigs: {}
    };

    document
      .querySelectorAll(".ai-config")
      .forEach((container) => {
        const aiKey = container.getAttribute("data-ai");
        const config = {
          inputSelector: container.querySelector(".input-selector").value.trim(),
          submitButtonSelector: container.querySelector(".submit-selector").value.trim(),
          answerContainerSelector: container.querySelector(".answer-selector").value.trim()
        };
        const copyVal = (container.querySelector(".copy-selector")?.value || "").trim();
        const doneVal = (container.querySelector(".done-selector")?.value || "").trim();
        const submitMethodVal = (container.querySelector(".submit-method-selector")?.value || "").trim();
        const inputSuccessFallbackVal = (container.querySelector(".input-success-fallback-selector")?.value || "").trim();
        if (copyVal) config.copyButtonSelector = copyVal;
        config.doneCheckSelector = doneVal;
        if (submitMethodVal) config.submitMethod = submitMethodVal;
        if (inputSuccessFallbackVal) {
          config.inputSuccessFallback = inputSuccessFallbackVal;
        } else {
          // 空欄保存時は上書き設定を削除して既定値に戻す
          config.inputSuccessFallback = null;
        }
        partial.aiConfigs[aiKey] = config;
      });

    await storage.saveSettings(partial);
    status.textContent = "保存しました。";
    setTimeout(() => {
      status.textContent = "";
    }, 2000);
  }

  saveButton.addEventListener("click", () => {
    save().catch((err) => {
      console.error(err);
      status.textContent = "保存に失敗しました。コンソールを確認してください。";
    });
  });

  restore().catch((err) => {
    console.error(err);
    status.textContent = "設定の読み込みに失敗しました。コンソールを確認してください。";
  });

  document.getElementById("retry-button").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: MSG_RETRY });
    status.textContent = "再送信を開始しました。";
    setTimeout(() => { status.textContent = ""; }, 3000);
  });

  openRouterRefreshButton.addEventListener("click", async () => {
    const settings = await storage.getSettings();
    const provider = digestService.resolveProvider(settings);
    if (!provider.apiKey) {
      openRouterRefreshStatus.textContent = `${provider.name} の API キーを入力してください。`;
      return;
    }
    openRouterRefreshButton.disabled = true;
    openRouterRefreshStatus.textContent = `${provider.name} の free 候補を更新中...`;
    try {
      const catalog = await provider.client.fetchModelsCatalog({ apiKey: provider.apiKey, fetchImpl: fetch });
      const refreshed = provider.freeModelSelector.refreshDigestFreeModels({
        catalog,
        preferredModel: openRouterPreferredModelInput.value.trim()
      });
      const providerKey = provider.name === "opencodezen" ? "opencodezen" : "openrouter";
      const nextSettings = await storage.saveSettings({
        [providerKey]: {
          freeModelCandidatesOverride: refreshed.candidates,
          lastRefreshStats: refreshed.stats,
          lastRefreshAt: new Date().toISOString()
        }
      });
      const providerSettings = provider.name === "opencodezen"
        ? nextSettings.opencodezen
        : nextSettings.openrouter;
      openRouterRefreshStatus.textContent =
        `free取得 ${refreshed.stats.freeCount ?? 0}件 / digest候補 ${refreshed.candidates.length}件 / ` +
        `プルダウン表示 ${refreshed.candidates.length}件 を更新しました。`;
      populatePreferredModelOptions(nextSettings);
      populateTestModelSuggestions(nextSettings);
      openRouterRefreshMeta.textContent = formatRefreshMeta(
        providerSettings,
        provider.name === "opencodezen" ? "OpenCode Zen" : "OpenRouter"
      );
    } catch (error) {
      openRouterRefreshStatus.textContent = `候補更新に失敗しました: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      openRouterRefreshButton.disabled = false;
    }
  });

  openRouterTestButton.addEventListener("click", () => {
    runOpenRouterDiagnostic().catch((error) => {
      setOpenRouterTestStatus("テスト実行に失敗しました。", "error");
      openRouterTestLog.textContent = error instanceof Error ? error.stack || error.message : String(error);
      setOpenRouterTestButtonsDisabled(false);
    });
  });

  openRouterTestCopyButton.addEventListener("click", () => {
    copyOpenRouterDiagnosticLog().catch((error) => {
      setOpenRouterTestStatus(
        `ログのコピーに失敗しました: ${error instanceof Error ? error.message : String(error)}`,
        "error"
      );
    });
  });

  aiOrderList?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action][data-ai]");
    if (!button) return;
    const aiKey = button.getAttribute("data-ai") || "";
    const action = button.getAttribute("data-action") || "";
    if (action === "up") {
      moveAiOrder(aiKey, -1);
      return;
    }
    if (action === "down") {
      moveAiOrder(aiKey, 1);
    }
  });
});

