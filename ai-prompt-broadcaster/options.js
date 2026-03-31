document.addEventListener("DOMContentLoaded", async () => {
  const baseUrlInput = document.getElementById("obsidian-base-url");
  const tokenInput = document.getElementById("obsidian-token");
  const rootPathInput = document.getElementById("obsidian-root-path");
  const openRouterEnableDigestInput = document.getElementById("openrouter-enable-digest");
  const openRouterApiKeyInput = document.getElementById("openrouter-api-key");
  const openRouterPreferredModelInput = document.getElementById("openrouter-preferred-model");
  const openRouterRefreshButton = document.getElementById("openrouter-refresh-models-button");
  const openRouterRefreshStatus = document.getElementById("openrouter-refresh-status");
  const openRouterRefreshMeta = document.getElementById("openrouter-refresh-meta");
  const saveButton = document.getElementById("save-button");
  const status = document.getElementById("status");

  const storage = window.MirrorChatStorage;
  const openRouterClient = window.MirrorChatOpenRouterClient;
  const openRouterFreeModels = window.MirrorChatOpenRouterFreeModels;
  const MESSAGE_TYPES = window.MirrorChatConstants?.MESSAGE_TYPES || {};
  const MSG_RETRY = MESSAGE_TYPES.RETRY || "MIRRORCHAT_RETRY";

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
    openRouterPreferredModelInput.value = settings.openrouter?.preferredModel || "";
    openRouterRefreshMeta.textContent = formatRefreshMeta(settings.openrouter);
    openRouterRefreshStatus.textContent = "";

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
      openRouterRefreshMeta.textContent = formatRefreshMeta(nextSettings.openrouter);
    } catch (error) {
      openRouterRefreshStatus.textContent = `候補更新に失敗しました: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      openRouterRefreshButton.disabled = false;
    }
  });
});

