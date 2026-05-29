document.addEventListener("DOMContentLoaded", async () => {
  // 拡張ポップアップ上では一部環境で日本語IMEが正しく動作しないことがあるため、
  // 初回起動時は自動的に同じUIを専用タブ（standalone）として開き、ポップアップ自体はすぐ閉じる。
  // standalone モード（?standalone=1）ではこのリダイレクトは行わない。
  try {
    const search = window.location.search || "";
    const params = new URLSearchParams(search);
    const isStandalone = params.get("standalone") === "1";
    if (!isStandalone && chrome?.tabs?.create && chrome?.runtime?.getURL) {
      const url = chrome.runtime.getURL("popup.html?standalone=1");
      chrome.tabs.create({ url }, () => {
        window.close();
      });
      return;
    }
  } catch (e) {
    console.warn("MirrorChat: standalone モードへの切り替えに失敗しました:", e);
  }

  const promptInput = document.getElementById("prompt-input");
  const followUpCheckbox = document.getElementById("follow-up-checkbox");
  const sendButton = document.getElementById("send-button");
  const collectButton = document.getElementById("collect-button");
  const openTabsButton = document.getElementById("open-tabs-button");
  const closeTabsButton = document.getElementById("close-tabs-button");
  const status = document.getElementById("status");
  const digestStatus = document.getElementById("digest-status");
  const digestStatusText = document.getElementById("digest-status-text");
  const digestStatusError = document.getElementById("digest-status-error");
  const retrySection = document.getElementById("retry-section");
  const retryButton = document.getElementById("retry-button");
  const resaveButton = document.getElementById("resave-button");
  const regenerateDigestButton = document.getElementById("regenerate-digest-button");
  const digestModelSelect = document.getElementById("digest-model-select");
  const exportOutput = document.getElementById("export-output");
  const copyExportButton = document.getElementById("copy-export-button");
  const exportStatus = document.getElementById("export-status");
  const snapshotMenuButton = document.getElementById("snapshot-menu-button");
  const snapshotDrawer = document.getElementById("snapshot-drawer");
  const snapshotBackdrop = document.getElementById("snapshot-backdrop");
  const snapshotDrawerClose = document.getElementById("snapshot-drawer-close");
  const snapshotList = document.getElementById("snapshot-list");
  const snapshotListEmpty = document.getElementById("snapshot-list-empty");
  const tabStatus = document.getElementById("tab-status");
  const noteContentBuilder = window.MirrorChatNoteContentBuilder;
  const snapshotHistoryManager = window.MirrorChatSnapshotHistoryManager;

  const constants = window.MirrorChatConstants || {};
  const AI_KEYS = constants.AI_KEYS ?? ["chatgpt", "claude", "gemini", "grok"];
  const AI_DEFAULT_ORDER = constants.AI_DEFAULT_ORDER ?? ["gemini", "chatgpt", "claude", "grok"];
  const aiOrderUtils = window.MirrorChatAIOrderUtils;
  const normalizeAiOrder = aiOrderUtils.normalizeAiOrder;
  const resolveEnabledAIs = aiOrderUtils.resolveEnabledAIs;
  const normalizeEnabledAiMap = aiOrderUtils.normalizeEnabledAiMap;
  const getDefaultEnabledAiMap = aiOrderUtils.getDefaultEnabledAiMap;
  const MESSAGE_TYPES = constants.MESSAGE_TYPES || {};
  const currentTaskKey = constants.STORAGE_KEYS?.CURRENT_TASK ?? "mirrorchatCurrentTask";
  const failedItemsKey = constants.STORAGE_KEYS?.FAILED_ITEMS ?? "mirrorchatFailedItems";
  const settingsKey = constants.STORAGE_KEYS?.SETTINGS ?? "mirrorchatSettings";

  const MSG_GET_TAB_STATUS = MESSAGE_TYPES.GET_TAB_STATUS || "MIRRORCHAT_GET_TAB_STATUS";
  const MSG_OPEN_TABS = MESSAGE_TYPES.OPEN_TABS || "MIRRORCHAT_OPEN_TABS";
  const MSG_CLOSE_TABS = MESSAGE_TYPES.CLOSE_TABS || "MIRRORCHAT_CLOSE_TABS";
  const MSG_SEND = MESSAGE_TYPES.SEND || "MIRRORCHAT_SEND";
  const MSG_FETCH = MESSAGE_TYPES.FETCH || "MIRRORCHAT_FETCH";
  const MSG_RETRY = MESSAGE_TYPES.RETRY || "MIRRORCHAT_RETRY";
  const MSG_RESAVE_LAST = MESSAGE_TYPES.RESAVE_LAST || "MIRRORCHAT_RESAVE_LAST";
  const MSG_REGENERATE_DIGEST = MESSAGE_TYPES.REGENERATE_DIGEST || "MIRRORCHAT_REGENERATE_DIGEST";
  const MSG_STATUS = MESSAGE_TYPES.STATUS || "MIRRORCHAT_STATUS";
  const MSG_DIGEST_STATUS = MESSAGE_TYPES.DIGEST_STATUS || "MIRRORCHAT_DIGEST_STATUS";
  const MSG_AI_STATUS = MESSAGE_TYPES.AI_STATUS || "MIRRORCHAT_AI_STATUS";
  const MSG_DONE = MESSAGE_TYPES.DONE || "MIRRORCHAT_DONE";
  const MSG_EXPORT_CONTENT = MESSAGE_TYPES.EXPORT_CONTENT || "MIRRORCHAT_EXPORT_CONTENT";
  const MSG_SNAPSHOT_HISTORY_UPDATED =
    MESSAGE_TYPES.SNAPSHOT_HISTORY_UPDATED || "MIRRORCHAT_SNAPSHOT_HISTORY_UPDATED";
  const storage = window.MirrorChatStorage;
  const openRouterFreeModels = window.MirrorChatOpenRouterFreeModels;
  const openCodeZenFreeModels = window.MirrorChatOpenCodeZenFreeModels;

  const indicators = {};
  const aiCheckboxes = {};
  const tabItems = {};
  AI_KEYS.forEach((key) => {
    indicators[key] = document.getElementById("ind-" + key);
    aiCheckboxes[key] = document.querySelector('.ai-checkbox[data-ai="' + key + '"]');
    tabItems[key] = tabStatus?.querySelector('.tab-item[data-ai="' + key + '"]') || null;
  });

  function applyAiOrderToTabItems(aiOrder) {
    const normalized = normalizeAiOrder(aiOrder);
    normalized.forEach((aiKey) => {
      const item = tabItems[aiKey];
      if (item && tabStatus) {
        tabStatus.appendChild(item);
      }
    });
    return normalized;
  }

  function normalizeEnabledAIs(enabledAIs, aiOrder) {
    return normalizeEnabledAiMap(enabledAIs, aiOrder);
  }

  function getDefaultEnabledAIs(aiOrder = AI_DEFAULT_ORDER) {
    return getDefaultEnabledAiMap(aiOrder);
  }

  function getSelectedAIs(enabledAIs, aiOrder = appState.aiOrder) {
    return resolveEnabledAIs(
      normalizeAiOrder(aiOrder).filter((key) => !!enabledAIs[key]),
      aiOrder
    );
  }

  const appState = {
    statusText: "",
    digestStatusText: "",
    digestStatusError: "",
    digestStatusTone: "info",
    openTabs: {},
    aiStates: Object.fromEntries(AI_KEYS.map((key) => [key, ""])),
    aiOrder: normalizeAiOrder(AI_DEFAULT_ORDER),
    enabledAIs: getDefaultEnabledAIs(AI_DEFAULT_ORDER),
    hasPendingQuestion: false,
    allowCollect: false,
    hasFailedItems: false,
    hasLastObsidianNote: false,
    hasLastExport: false,
    exportMarkdown: "",
    exportStatusText: "",
    exportStatusTone: "info",
    snapshotHistory: [],
    activeSnapshotId: null,
    snapshotDrawerOpen: false,
    busyAction: ""
  };

  function resolveDigestProviderConfig(settings) {
    const providerName = String(
      settings?.digestProvider || (settings?.openrouter?.enableDigest ? "openrouter" : "")
    ).trim().toLowerCase();
    if (providerName === "opencodezen") {
      return {
        name: "opencodezen",
        preferredModel: settings?.opencodezen?.preferredModel,
        freeModelCandidatesOverride: settings?.opencodezen?.freeModelCandidatesOverride,
        selector: openCodeZenFreeModels
      };
    }
    return {
      name: "openrouter",
      preferredModel: settings?.openrouter?.preferredModel,
      freeModelCandidatesOverride: settings?.openrouter?.freeModelCandidatesOverride,
      selector: openRouterFreeModels
    };
  }

  function buildDigestModelOptions(settings) {
    const provider = resolveDigestProviderConfig(settings);
    if (provider.selector?.buildSelectOptions) {
      return provider.selector.buildSelectOptions({
        preferredModel: provider.preferredModel,
        candidates: provider.freeModelCandidatesOverride
      }).map((option, index) => (index === 0 ? { ...option, label: "自動選択" } : option));
    }

    const preferredModel = String(provider.preferredModel || "").trim();
    const candidates = Array.isArray(provider.freeModelCandidatesOverride)
      ? provider.freeModelCandidatesOverride
      : [];
    const unique = new Set();
    const ordered = [];
    for (const modelId of [preferredModel, ...candidates]) {
      const normalized = String(modelId || "").trim();
      if (!normalized || unique.has(normalized)) continue;
      unique.add(normalized);
      ordered.push(normalized);
    }
    return [{ value: "", label: "自動選択" }, ...ordered.map((modelId) => ({ value: modelId, label: modelId }))];
  }

  function populateDigestModelSelect(settings) {
    const currentValue = digestModelSelect.value;
    const options = buildDigestModelOptions(settings);
    digestModelSelect.innerHTML = "";
    options.forEach(({ value, label }) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      digestModelSelect.appendChild(option);
    });
    const values = new Set(options.map((option) => option.value));
    digestModelSelect.value = values.has(currentValue) ? currentValue : "";
  }

  function setIndicator(aiKey, stateName) {
    const el = indicators[aiKey];
    if (!el) return;
    el.className = "indicator";
    if (stateName) el.classList.add(stateName);
  }

  function setState(patch) {
    Object.assign(appState, patch);
    render();
  }

  function getAiIndicatorState(aiKey) {
    return appState.aiStates[aiKey] || (appState.openTabs[aiKey] ? "open" : "");
  }

  function render() {
    const hasOpenTabs = Object.keys(appState.openTabs || {}).length > 0;
    const selectedAIs = getSelectedAIs(appState.enabledAIs, appState.aiOrder);

    appState.aiOrder.forEach((key) => {
      setIndicator(key, getAiIndicatorState(key));
      if (aiCheckboxes[key]) aiCheckboxes[key].checked = !!appState.enabledAIs[key];
    });

    openTabsButton.disabled = hasOpenTabs || appState.busyAction === "opening";
    closeTabsButton.disabled = !hasOpenTabs;
    sendButton.disabled = !hasOpenTabs || appState.hasPendingQuestion || selectedAIs.length === 0;
    collectButton.disabled = !hasOpenTabs || !appState.allowCollect || appState.busyAction === "collecting";
    retrySection.hidden = !appState.hasFailedItems;
    retryButton.disabled = !appState.hasFailedItems || appState.busyAction === "retrying";
    resaveButton.disabled = !appState.hasLastObsidianNote || appState.busyAction === "resaving";
    regenerateDigestButton.disabled =
      !appState.hasLastExport || appState.busyAction === "regenerating-digest";
    digestModelSelect.disabled =
      !appState.hasLastExport || appState.busyAction === "regenerating-digest";
    if (copyExportButton) {
      copyExportButton.disabled = !appState.hasLastExport;
    }
    if (exportOutput) {
      exportOutput.value = appState.exportMarkdown || "";
    }
    if (exportStatus) {
      exportStatus.textContent = appState.exportStatusText || "";
      exportStatus.dataset.tone = appState.exportStatusTone || "info";
    }
    status.textContent = appState.statusText;
    digestStatus.dataset.tone = appState.digestStatusTone || "info";
    digestStatusText.textContent = appState.digestStatusText;
    digestStatusError.textContent = appState.digestStatusError;
    renderSnapshotList();
    if (snapshotDrawer) snapshotDrawer.hidden = !appState.snapshotDrawerOpen;
    if (snapshotBackdrop) snapshotBackdrop.hidden = !appState.snapshotDrawerOpen;
    if (snapshotMenuButton) {
      snapshotMenuButton.setAttribute("aria-expanded", appState.snapshotDrawerOpen ? "true" : "false");
    }
  }

  function formatSnapshotTime(savedAt) {
    const date = new Date(savedAt || 0);
    if (Number.isNaN(date.getTime())) return "日時不明";
    return date.toLocaleString("ja-JP", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function formatSnapshotQuestion(question) {
    const text = String(question || "")
      .replace(/[\r\n]+/g, " ")
      .trim();
    if (!text) return "(質問なし)";
    return text.length > 40 ? `${text.slice(0, 40)}…` : text;
  }

  function renderSnapshotList() {
    if (!snapshotList) return;
    snapshotList.innerHTML = "";
    const history = appState.snapshotHistory || [];
    if (snapshotListEmpty) {
      snapshotListEmpty.hidden = history.length > 0;
    }
    history.forEach((entry) => {
      const item = document.createElement("li");
      item.className = "snapshot-list-item";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "snapshot-list-button";
      if (entry.id === appState.activeSnapshotId) {
        button.classList.add("is-active");
      }
      const timeEl = document.createElement("time");
      timeEl.textContent = formatSnapshotTime(entry.savedAt);
      const labelEl = document.createElement("span");
      labelEl.textContent = formatSnapshotQuestion(entry.question);
      button.appendChild(timeEl);
      button.appendChild(labelEl);
      button.addEventListener("click", () => {
        void applySelectedSnapshot(entry.id);
      });
      item.appendChild(button);
      snapshotList.appendChild(item);
    });
  }

  function openSnapshotDrawer() {
    setState({ snapshotDrawerOpen: true });
  }

  function closeSnapshotDrawer() {
    setState({ snapshotDrawerOpen: false });
  }

  function getActionSnapshotId() {
    return appState.activeSnapshotId || appState.snapshotHistory[0]?.id || null;
  }

  async function applySelectedSnapshot(snapshotId) {
    const history = await snapshotHistoryManager.readSnapshotHistory();
    const snapshot = history.find((entry) => entry.id === snapshotId);
    if (!snapshot) return;
    const settings = await storage.getSettings();
    const markdown = snapshot.exportMarkdown || "";
    setState({
      snapshotHistory: history,
      activeSnapshotId: snapshot.id,
      exportMarkdown: markdown,
      hasLastExport: snapshotHasExportData(snapshot),
      hasLastObsidianNote:
        !!snapshot.notePath && !!noteContentBuilder?.isObsidianConfigured?.(settings),
      exportStatusText: markdown ? "履歴を表示しています。コピーできます。" : "この履歴には Markdown がありません。",
      exportStatusTone: markdown ? "success" : "info",
      snapshotDrawerOpen: false
    });
  }

  async function readLocalStorage(key) {
    return new Promise((resolve) => {
      chrome.storage.local.get(key, (data) => {
        resolve(data?.[key]);
      });
    });
  }

  async function syncTaskState() {
    const current = await readLocalStorage(currentTaskKey);
    setState({
      hasPendingQuestion: !!current?.prompt,
      allowCollect: !!current?.prompt
    });
    return current;
  }

  async function syncRetryState() {
    const items = (await readLocalStorage(failedItemsKey)) || [];
    setState({ hasFailedItems: items.length > 0 });
  }

  function snapshotHasExportData(snapshot) {
    if (snapshot?.exportMarkdown) return true;
    return !!(snapshot?.question && Array.isArray(snapshot?.results) && snapshot.results.length > 0);
  }

  async function syncLastSavedNoteState() {
    const [history, settings] = await Promise.all([
      snapshotHistoryManager.readSnapshotHistory(),
      storage.getSettings()
    ]);
    const nextOrder = applyAiOrderToTabItems(settings?.aiOrder);
    populateDigestModelSelect(settings);
    const metadataSnapshot = appState.activeSnapshotId
      ? history.find((entry) => entry.id === appState.activeSnapshotId) || history[0] || null
      : history[0] || null;
    const hasLastExport = snapshotHasExportData(metadataSnapshot);
    const hasLastObsidianNote =
      !!metadataSnapshot?.notePath && !!noteContentBuilder?.isObsidianConfigured?.(settings);
    setState({
      aiOrder: nextOrder,
      enabledAIs: normalizeEnabledAIs(appState.enabledAIs, nextOrder),
      snapshotHistory: history,
      hasLastObsidianNote,
      hasLastExport
    });
    return metadataSnapshot;
  }

  function refreshTabStatus() {
    chrome.runtime.sendMessage({ type: MSG_GET_TAB_STATUS }, async (resp) => {
      if (chrome.runtime.lastError) return;
      const current = await readLocalStorage(currentTaskKey);
      setState({
        openTabs: resp?.openTabs || {},
        hasPendingQuestion: !!current?.prompt,
        allowCollect: !!current?.prompt
      });
    });
  }

  openTabsButton.addEventListener("click", () => {
    const enabledAIs = getSelectedAIs(appState.enabledAIs, appState.aiOrder);
    if (enabledAIs.length === 0) {
      setState({ statusText: "使用する AI を1つ以上選択してください。" });
      return;
    }

    setState({ busyAction: "opening", statusText: "AIサイトを開いています..." });
    chrome.runtime.sendMessage({ type: MSG_OPEN_TABS, enabledAIs }, (resp) => {
      if (chrome.runtime.lastError) {
        setState({
          busyAction: "",
          statusText: "タブを開けませんでした: " + chrome.runtime.lastError.message
        });
        return;
      }
      if (!resp || !resp.ok) {
        setState({
          busyAction: "",
          statusText: "タブを開けませんでした: " + (resp?.error || "不明なエラー")
        });
        return;
      }
      setState({
        busyAction: "",
        openTabs: resp?.openTabs || {},
        hasPendingQuestion: false,
        allowCollect: false,
        statusText: "AIサイトを開きました。ログイン等を済ませてから質問を送信してください。"
      });
    });
  });

  closeTabsButton.addEventListener("click", () => {
    const enabledAIs = getSelectedAIs(appState.enabledAIs, appState.aiOrder);
    if (enabledAIs.length === 0) {
      setState({ statusText: "使用する AI を1つ以上選択してください。" });
      return;
    }
    chrome.runtime.sendMessage({ type: MSG_CLOSE_TABS, enabledAIs }, () => {
      if (chrome.runtime.lastError) return;
      refreshTabStatus();
      setState({ statusText: "選択したAIサイトのタブを閉じました。" });
    });
  });

  sendButton.addEventListener("click", () => {
    const text = promptInput.value.trim();
    if (!text) {
      setState({ statusText: "質問を入力してください。" });
      return;
    }

    const enabledAIs = getSelectedAIs(appState.enabledAIs, appState.aiOrder);
    if (enabledAIs.length === 0) {
      setState({ statusText: "使用する AI を1つ以上選択してください。" });
      return;
    }

    const isFollowUp = followUpCheckbox.checked;
    const nextAiStates = Object.fromEntries(AI_KEYS.map((key) => [key, enabledAIs.includes(key) ? "sending" : ""]));
    setState({
      busyAction: "sending",
      hasPendingQuestion: true,
      allowCollect: true,
      aiStates: nextAiStates,
      exportMarkdown: "",
      activeSnapshotId: null,
      exportStatusText: "",
      exportStatusTone: "info",
      digestStatusText: "",
      digestStatusError: "",
      digestStatusTone: "info",
      statusText: isFollowUp
        ? "続きの質問を送信中...各AIの既存会話に追加されます。回答生成完了後に「回答を取得」を押してください。"
        : "送信中...各AIに質問を送っています。回答生成完了後に「回答を取得」を押してください。"
    });

    chrome.runtime.sendMessage({ type: MSG_SEND, prompt: text, isFollowUp, enabledAIs }, (resp) => {
      if (chrome.runtime.lastError) {
        setState({
          busyAction: "",
          hasPendingQuestion: false,
          allowCollect: false,
          statusText: "送信に失敗しました: " + chrome.runtime.lastError.message
        });
        refreshTabStatus();
        return;
      }
      if (!resp || !resp.ok) {
        setState({
          busyAction: "",
          hasPendingQuestion: false,
          allowCollect: false,
          statusText: "送信に失敗しました: " + (resp?.error || "不明なエラー")
        });
        refreshTabStatus();
        return;
      }
      setState({
        busyAction: "",
        exportMarkdown: "",
        activeSnapshotId: null,
        exportStatusText: "回答取得後に Markdown がここに表示されます。",
        exportStatusTone: "info",
        statusText: "送信が完了しました。各AIの回答が出揃ったら「回答を取得」を押してください。"
      });
    });
  });

  collectButton.addEventListener("click", () => {
    setState({
      busyAction: "collecting",
      allowCollect: false,
      exportMarkdown: "",
      exportStatusText: "回答を取得しています...",
      exportStatusTone: "info",
      statusText: "回答を取得中です。タブを順番にフォーカスしてテキストを収集します..."
    });

    chrome.runtime.sendMessage({ type: MSG_FETCH }, (resp) => {
      if (chrome.runtime.lastError) {
        setState({
          busyAction: "",
          allowCollect: true,
          statusText: "回答取得の開始に失敗しました: " + chrome.runtime.lastError.message
        });
        return;
      }
      if (!resp || !resp.ok) {
        setState({
          busyAction: "",
          allowCollect: true,
          statusText: "回答取得の開始に失敗しました: " + (resp?.error || "不明なエラー")
        });
        return;
      }
      setState({
        busyAction: "collecting",
        exportStatusText: "回答を取得しています...",
        exportStatusTone: "info",
        statusText: "回答取得を開始しました。バックグラウンドで順次処理されます。"
      });
    });
  });

  function doResave() {
    const snapshotId = getActionSnapshotId();
    if (!snapshotId) {
      setState({ statusText: "再保存できる履歴がありません。" });
      return;
    }
    setState({ busyAction: "resaving", statusText: "ノートを再保存しています..." });
    chrome.runtime.sendMessage({ type: MSG_RESAVE_LAST, snapshotId }, async (resp) => {
      if (chrome.runtime.lastError) {
        setState({
          busyAction: "",
          statusText: "再保存に失敗しました: " + chrome.runtime.lastError.message
        });
      } else if (!resp?.ok) {
        setState({
          busyAction: "",
          statusText: "再保存に失敗しました: " + (resp?.error || "不明なエラー")
        });
      } else {
        setState({
          busyAction: "",
          statusText: "直近ノートを再保存しました。"
        });
      }
      await syncLastSavedNoteState();
    });
  }

  async function doRetryFailedItems() {
    setState({ busyAction: "retrying", statusText: "失敗キューを再試行しています..." });
    chrome.runtime.sendMessage({ type: MSG_RETRY }, async (resp) => {
      if (chrome.runtime.lastError) {
        setState({
          busyAction: "",
          statusText: "再試行に失敗しました: " + chrome.runtime.lastError.message
        });
      } else if (!resp?.ok) {
        setState({
          busyAction: "",
          statusText: "再試行に失敗しました: " + (resp?.error || "不明なエラー")
        });
      } else {
        setState({
          busyAction: "",
          statusText: "失敗キューの再試行を開始しました。"
        });
      }
      await syncRetryState();
    });
  }

  function doRegenerateDigest() {
    const snapshotId = getActionSnapshotId();
    if (!snapshotId) {
      setState({
        digestStatusText: "digest を再生成できる履歴がありません。",
        digestStatusTone: "error"
      });
      return;
    }
    setState({
      busyAction: "regenerating-digest",
      digestStatusText: "digest を再生成しています...",
      digestStatusError: "",
      digestStatusTone: "info"
    });
    chrome.runtime.sendMessage(
      { type: MSG_REGENERATE_DIGEST, modelId: digestModelSelect.value, snapshotId },
      async (resp) => {
        if (chrome.runtime.lastError) {
          setState({
            busyAction: "",
            digestStatusText: "digest の再生成に失敗しました。",
            digestStatusError: chrome.runtime.lastError.message,
            digestStatusTone: "error"
          });
        } else if (!resp?.ok) {
          setState({
            busyAction: "",
            digestStatusText: "digest の再生成に失敗しました。",
            digestStatusError: resp?.error || "不明なエラー",
            digestStatusTone: "error"
          });
        } else {
          setState({
            busyAction: "",
            digestStatusText: "digest の再生成を開始しました。",
            digestStatusError: "",
            digestStatusTone: "info"
          });
        }
        await syncLastSavedNoteState();
      }
    );
  }

  async function copyExportMarkdown() {
    const text = (appState.exportMarkdown || exportOutput?.value || "").trim();
    if (!text) {
      setState({ statusText: "コピーする Markdown がありません。" });
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setState({
        exportStatusText: "コピーしました。",
        exportStatusTone: "success"
      });
    } catch (error) {
      if (exportOutput) {
        exportOutput.focus();
        exportOutput.select();
      }
      setState({
        exportStatusText:
          "クリップボードにコピーできませんでした。テキストを選択して手動でコピーしてください。",
        exportStatusTone: "error"
      });
      console.warn("MirrorChat: export copy failed:", error);
    }
  }

  retryButton.addEventListener("click", doRetryFailedItems);
  resaveButton.addEventListener("click", doResave);
  regenerateDigestButton.addEventListener("click", doRegenerateDigest);
  copyExportButton?.addEventListener("click", () => {
    void copyExportMarkdown();
  });
  snapshotMenuButton?.addEventListener("click", () => {
    if (appState.snapshotDrawerOpen) {
      closeSnapshotDrawer();
    } else {
      void syncLastSavedNoteState().then(() => openSnapshotDrawer());
    }
  });
  snapshotDrawerClose?.addEventListener("click", closeSnapshotDrawer);
  snapshotBackdrop?.addEventListener("click", closeSnapshotDrawer);

  AI_KEYS.forEach((key) => {
    const checkbox = aiCheckboxes[key];
    if (!checkbox) return;
    checkbox.addEventListener("change", () => {
      const nextEnabledAIs = {
        ...appState.enabledAIs,
        [key]: !!checkbox.checked
      };
      setState({ enabledAIs: nextEnabledAIs });
    });
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === MSG_STATUS) {
      setState({ statusText: msg.text || "" });
      return;
    }
    if (msg.type === MSG_DIGEST_STATUS) {
      const digestPatch = {
        digestStatusText: msg.text || "",
        digestStatusError: msg.errorText || "",
        digestStatusTone: msg.tone || "info"
      };
      if (appState.exportMarkdown) {
        const tone = msg.tone || "info";
        if (tone === "success") {
          digestPatch.exportStatusText = "まとめを反映しました。";
          digestPatch.exportStatusTone = "success";
        } else if (tone === "error") {
          digestPatch.exportStatusText =
            "まとめの反映に失敗しました。Markdown 出力は利用できます。";
          digestPatch.exportStatusTone = "error";
        } else {
          digestPatch.exportStatusText = "まとめを更新しています...";
          digestPatch.exportStatusTone = "info";
        }
      }
      setState(digestPatch);
      return;
    }
    if (msg.type === MSG_AI_STATUS) {
      setState({
        aiStates: {
          ...appState.aiStates,
          [msg.ai]: msg.state || ""
        }
      });
      return;
    }
    if (msg.type === MSG_EXPORT_CONTENT) {
      const markdown = msg.markdown || "";
      void (async () => {
        const history = await snapshotHistoryManager.readSnapshotHistory();
        const latest = history[0] || null;
        setState({
          snapshotHistory: history,
          activeSnapshotId: latest?.id || null,
          exportMarkdown: markdown,
          hasLastExport: !!markdown,
          exportStatusText: markdown
            ? "Markdown を出力しました。コピーできます。"
            : "",
          exportStatusTone: markdown ? "success" : "info"
        });
      })();
      return;
    }
    if (msg.type === MSG_SNAPSHOT_HISTORY_UPDATED) {
      void syncLastSavedNoteState();
      return;
    }
    if (msg.type === MSG_DONE) {
      setState({
        busyAction: "",
        allowCollect: !!msg.saveFailed
      });
      void syncRetryState();
      void syncLastSavedNoteState();
      refreshTabStatus();
    }
  });

  chrome.storage.onChanged?.addListener((changes, areaName) => {
    const snapshotHistoryKey = constants.STORAGE_KEYS?.SNAPSHOT_HISTORY ?? "mirrorchatSnapshotHistory";
    if (areaName === "local" && Object.prototype.hasOwnProperty.call(changes || {}, snapshotHistoryKey)) {
      void syncLastSavedNoteState();
      return;
    }
    if (areaName !== "sync") return;
    if (!Object.prototype.hasOwnProperty.call(changes || {}, settingsKey)) return;
    void syncLastSavedNoteState();
  });

  await syncRetryState();
  await syncLastSavedNoteState();
  setState({
    aiOrder: normalizeAiOrder(appState.aiOrder),
    enabledAIs: getDefaultEnabledAIs(appState.aiOrder),
    exportMarkdown: "",
    exportStatusText: "",
    exportStatusTone: "info"
  });
  refreshTabStatus();
  promptInput.value = "";
  followUpCheckbox.checked = false;

  const current = await syncTaskState();
  if (current?.prompt) {
    setState({
      statusText: "前回の質問の回答が未取得です。「回答を取得」を押してください。"
    });
  } else {
    render();
  }
});