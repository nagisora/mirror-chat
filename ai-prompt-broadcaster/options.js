document.addEventListener("DOMContentLoaded", async () => {
  const OPENROUTER_TEST_TIMEOUT_MS = 15000;
  const OPENROUTER_TEST_ATTEMPT_LIMIT = 4;

  const baseUrlInput = document.getElementById("obsidian-base-url");
  const tokenInput = document.getElementById("obsidian-token");
  const rootPathInput = document.getElementById("obsidian-root-path");
  const openRouterEnableDigestInput = document.getElementById("openrouter-enable-digest");
  const openRouterApiKeyInput = document.getElementById("openrouter-api-key");
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

  const storage = window.MirrorChatStorage;
  const openRouterClient = window.MirrorChatOpenRouterClient;
  const openRouterFreeModels = window.MirrorChatOpenRouterFreeModels;
  const digestService = window.MirrorChatDigestService;
  const MESSAGE_TYPES = window.MirrorChatConstants?.MESSAGE_TYPES || {};
  const MSG_RETRY = MESSAGE_TYPES.RETRY || "MIRRORCHAT_RETRY";

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

  function buildDiagnosticPrompt() {
    if (digestService?.buildDigestPrompt) {
      return digestService.buildDigestPrompt(
        "MirrorChat の digest 診断です。各回答の要点を短く整理してください。",
        [
          { name: "ChatGPT", markdown: "- 要点A\n- 補足B", error: "" },
          { name: "Claude", markdown: "- 観点C\n- 気になる点D", error: "" }
        ]
      );
    }
    return {
      systemPrompt: "複数AI回答を日本語で短く整理してください。Markdownのみで出力してください。",
      userPrompt: "## 質問\nMirrorChat の digest 診断です。\n\n## 各AI回答\n### ChatGPT\n- 要点A\n\n### Claude\n- 観点B"
    };
  }

  function buildCandidateListForDiagnostic({ preferredModel, candidates }) {
    const ordered = openRouterFreeModels.buildCandidateList({ preferredModel, candidates });
    return ordered.slice(0, OPENROUTER_TEST_ATTEMPT_LIMIT);
  }

  function populateTestModelSuggestions(settings) {
    const candidates = openRouterFreeModels.buildCandidateList({
      preferredModel: settings?.openrouter?.preferredModel,
      candidates: settings?.openrouter?.freeModelCandidatesOverride
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
    const apiKey = openRouterApiKeyInput.value.trim() || settings.openrouter?.apiKey || "";
    if (!apiKey) {
      setOpenRouterTestStatus("OpenRouter API キーを入力してください。", "error");
      openRouterTestLog.textContent = "API キーが未設定のため診断を開始できません。";
      return;
    }

    const preferredModel = openRouterPreferredModelInput.value.trim();
    const requestedTestModel = openRouterTestModelInput.value.trim();
    const storedCandidates = Array.isArray(settings?.openrouter?.freeModelCandidatesOverride)
      ? settings.openrouter.freeModelCandidatesOverride
      : [];
    const prompt = buildDiagnosticPrompt();
    const logLines = [];
    const appendLog = (line = "") => {
      logLines.push(line);
      openRouterTestLog.textContent = logLines.join("\n");
      openRouterTestLog.scrollTop = openRouterTestLog.scrollHeight;
    };

    setOpenRouterTestButtonsDisabled(true);
    setOpenRouterTestStatus("digest API をテスト中...", "info");
    openRouterTestLog.textContent = "";

    try {
      appendLog(`[開始] ${new Date().toLocaleString("ja-JP")}`);
      appendLog(
        `[設定] preferredModel=${preferredModel || "(自動選択)"} / testModel=${requestedTestModel || "(自動候補順)"}`
      );
      appendLog(
        `[リクエスト] timeout=${OPENROUTER_TEST_TIMEOUT_MS}ms / systemPrompt=${prompt.systemPrompt.length} chars / userPrompt=${prompt.userPrompt.length} chars`
      );

      let diagnosticCandidates = [];
      if (requestedTestModel) {
        diagnosticCandidates = [requestedTestModel];
        appendLog("");
        appendLog(`[候補指定] 手動指定モデルをテストします: ${requestedTestModel}`);
      } else {
        try {
          appendLog("");
          appendLog("[候補取得] /models を確認しています...");
          const catalog = await openRouterClient.fetchModelsCatalog({
            apiKey,
            fetchImpl: fetch,
            timeoutMs: 8000
          });
          const refreshed = openRouterFreeModels.refreshDigestFreeModels({
            catalog,
            preferredModel
          });
          diagnosticCandidates = buildCandidateListForDiagnostic({
            preferredModel,
            candidates: refreshed.candidates
          });
          appendLog(`[候補取得] 成功: catalog=${catalog.length}件 / 診断候補=${diagnosticCandidates.length}件`);
        } catch (error) {
          diagnosticCandidates = buildCandidateListForDiagnostic({
            preferredModel,
            candidates: storedCandidates
          });
          appendLog(`[候補取得] 失敗: ${error instanceof Error ? error.message : String(error)}`);
          appendLog(`[候補取得] 保存済み/既定候補で続行: ${diagnosticCandidates.length}件`);
        }
      }

      appendLog(`[候補順] ${diagnosticCandidates.join(", ")}`);

      let successModelId = "";
      for (let index = 0; index < diagnosticCandidates.length; index += 1) {
        const modelId = diagnosticCandidates[index];
        appendLog("");
        appendLog(`[試行 ${index + 1}/${diagnosticCandidates.length}] ${modelId}`);

        const diagnostic = await openRouterClient.diagnoseChatCompletion({
          apiKey,
          modelId,
          systemPrompt: prompt.systemPrompt,
          userPrompt: prompt.userPrompt,
          fetchImpl: fetch,
          timeoutMs: OPENROUTER_TEST_TIMEOUT_MS
        });

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

        if (diagnostic.ok) {
          successModelId = modelId;
          appendLog(`[結果] 成功: ${truncateText(diagnostic.text)}`);
          break;
        }

        appendLog(`[結果] 失敗: ${diagnostic.error || "不明なエラー"}`);
        if (diagnostic.analysis?.reasoning) {
          appendLog(`[reasoning] ${truncateText(diagnostic.analysis.reasoning)}`);
        }
        if (diagnostic.payload || diagnostic.rawText) {
          appendLog("[payload]");
          appendLog(indentText(formatJsonForLog(diagnostic.payload || diagnostic.rawText)));
        }
      }

      if (successModelId) {
        setOpenRouterTestStatus(`テスト成功: ${successModelId}`, "success");
      } else {
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
    const options = openRouterFreeModels.buildSelectOptions({
      preferredModel: settings?.openrouter?.preferredModel,
      candidates: settings?.openrouter?.freeModelCandidatesOverride
    });
    openRouterPreferredModelInput.innerHTML = "";
    options.forEach(({ value, label }) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      openRouterPreferredModelInput.appendChild(option);
    });
    openRouterPreferredModelInput.value = settings?.openrouter?.preferredModel || "";
  }

  function formatRefreshMeta(openRouterSettings) {
    const candidates = Array.isArray(openRouterSettings?.freeModelCandidatesOverride)
      ? openRouterSettings.freeModelCandidatesOverride
      : [];
    const lastRefreshAt = String(openRouterSettings?.lastRefreshAt || "").trim();
    if (!lastRefreshAt && candidates.length === 0) {
      return "更新済み候補はまだありません。";
    }
    const parts = [];
    if (candidates.length > 0) {
      parts.push(`候補数: ${candidates.length}`);
    }
    if (lastRefreshAt) {
      parts.push(`最終更新: ${new Date(lastRefreshAt).toLocaleString("ja-JP")}`);
    }
    return parts.join(" / ");
  }

  async function restore() {
    const settings = await storage.getSettings();

    baseUrlInput.value = settings.obsidian.baseUrl || "";
    tokenInput.value = settings.obsidian.token || "";
    rootPathInput.value = settings.obsidian.rootPath || "";
    openRouterEnableDigestInput.checked = !!settings.openrouter?.enableDigest;
    openRouterApiKeyInput.value = settings.openrouter?.apiKey || "";
    populatePreferredModelOptions(settings);
    populateTestModelSuggestions(settings);
    openRouterRefreshMeta.textContent = formatRefreshMeta(settings.openrouter);
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
    const partial = {
      obsidian: {
        baseUrl: baseUrlInput.value.trim(),
        token: tokenInput.value.trim(),
        rootPath: rootPathInput.value.trim()
      },
      openrouter: {
        enableDigest: !!openRouterEnableDigestInput.checked,
        apiKey: openRouterApiKeyInput.value.trim(),
        preferredModel: openRouterPreferredModelInput.value.trim() || null
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
    const apiKey = openRouterApiKeyInput.value.trim() || settings.openrouter?.apiKey || "";
    openRouterRefreshButton.disabled = true;
    openRouterRefreshStatus.textContent = "OpenRouter の free 候補を更新中...";
    try {
      const catalog = await openRouterClient.fetchModelsCatalog({ apiKey, fetchImpl: fetch });
      const refreshed = openRouterFreeModels.refreshDigestFreeModels({
        catalog,
        preferredModel: openRouterPreferredModelInput.value.trim()
      });
      const nextSettings = await storage.saveSettings({
        openrouter: {
          freeModelCandidatesOverride: refreshed.candidates,
          lastRefreshAt: new Date().toISOString()
        }
      });
      openRouterRefreshStatus.textContent = `free 候補を更新しました。${refreshed.candidates.length}件`;
      populatePreferredModelOptions(nextSettings);
      populateTestModelSuggestions(nextSettings);
      openRouterRefreshMeta.textContent = formatRefreshMeta(nextSettings.openrouter);
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
});

