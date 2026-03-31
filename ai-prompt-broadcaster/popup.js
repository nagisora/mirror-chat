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
  const retrySection = document.getElementById("retry-section");
  const retryButton = document.getElementById("retry-button");
  const resaveButton = document.getElementById("resave-button");
  const regenerateDigestButton = document.getElementById("regenerate-digest-button");
  const digestModelSelect = document.getElementById("digest-model-select");

  const constants = window.MirrorChatConstants || {};
  const AI_KEYS = constants.AI_KEYS ?? ["chatgpt", "claude", "gemini", "grok"];
  const MESSAGE_TYPES = constants.MESSAGE_TYPES || {};
  const currentTaskKey = constants.STORAGE_KEYS?.CURRENT_TASK ?? "mirrorchatCurrentTask";
  const failedItemsKey = constants.STORAGE_KEYS?.FAILED_ITEMS ?? "mirrorchatFailedItems";
  const lastNoteSnapshotKey = constants.STORAGE_KEYS?.LAST_NOTE_SNAPSHOT ?? "mirrorchatLastNoteSnapshot";

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
  const storage = window.MirrorChatStorage;

  const indicators = {};
  const aiCheckboxes = {};
  AI_KEYS.forEach((key) => {
    indicators[key] = document.getElementById("ind-" + key);
    aiCheckboxes[key] = document.querySelector('.ai-checkbox[data-ai="' + key + '"]');
  });

  function getDefaultEnabledAIs() {
    return Object.fromEntries(AI_KEYS.map((key) => [key, true]));
  }

  function getSelectedAIs(enabledAIs) {
    return AI_KEYS.filter((key) => !!enabledAIs[key]);
  }

  const appState = {
    statusText: "",
    digestStatusText: "",
    openTabs: {},
    aiStates: Object.fromEntries(AI_KEYS.map((key) => [key, ""])),
    enabledAIs: getDefaultEnabledAIs(),
    hasPendingQuestion: false,
    allowCollect: false,
    hasFailedItems: false,
    hasLastSavedNote: false,
    busyAction: ""
  };

  function buildDigestModelOptions(settings) {
    const preferredModel = String(settings?.openrouter?.preferredModel || "").trim();
    const candidates = Array.isArray(settings?.openrouter?.freeModelCandidatesOverride)
      ? settings.openrouter.freeModelCandidatesOverride
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
    const selectedAIs = getSelectedAIs(appState.enabledAIs);

    AI_KEYS.forEach((key) => {
      setIndicator(key, getAiIndicatorState(key));
      if (aiCheckboxes[key]) aiCheckboxes[key].checked = !!appState.enabledAIs[key];
    });

    openTabsButton.disabled = hasOpenTabs || appState.busyAction === "opening";
    closeTabsButton.disabled = !hasOpenTabs;
    sendButton.disabled = !hasOpenTabs || appState.hasPendingQuestion || selectedAIs.length === 0;
    collectButton.disabled = !hasOpenTabs || !appState.allowCollect || appState.busyAction === "collecting";
    retrySection.hidden = !appState.hasFailedItems;
    retryButton.disabled = !appState.hasFailedItems || appState.busyAction === "retrying";
    resaveButton.disabled = !appState.hasLastSavedNote || appState.busyAction === "resaving";
    regenerateDigestButton.disabled = !appState.hasLastSavedNote || appState.busyAction === "regenerating-digest";
    digestModelSelect.disabled = !appState.hasLastSavedNote || appState.busyAction === "regenerating-digest";
    status.textContent = appState.statusText;
    digestStatus.textContent = appState.digestStatusText;
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

  async function syncLastSavedNoteState() {
    const [snapshot, settings] = await Promise.all([
      readLocalStorage(lastNoteSnapshotKey),
      storage.getSettings()
    ]);
    populateDigestModelSelect(settings);
    setState({ hasLastSavedNote: !!snapshot?.notePath });
    return snapshot;
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
    const enabledAIs = getSelectedAIs(appState.enabledAIs);
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
    const enabledAIs = getSelectedAIs(appState.enabledAIs);
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

    const enabledAIs = getSelectedAIs(appState.enabledAIs);
    if (enabledAIs.length === 0) {
      setState({ statusText: "使用する AI を1つ以上選択してください。" });
      return;
    }

    const isFollowUp = followUpCheckbox.checked;
    const nextAiStates = Object.fromEntries(
      AI_KEYS.map((key) => [key, enabledAIs.includes(key) ? "sending" : ""])
    );
    setState({
      busyAction: "sending",
      hasPendingQuestion: true,
      allowCollect: true,
      aiStates: nextAiStates,
      digestStatusText: "",
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
        statusText: "送信が完了しました。各AIの回答が出揃ったら「回答を取得」を押してください。"
      });
    });
  });

  collectButton.addEventListener("click", () => {
    setState({
      busyAction: "collecting",
      allowCollect: false,
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
        statusText: "回答取得を開始しました。バックグラウンドで順次処理されます。"
      });
    });
  });

  function doResave() {
    setState({ busyAction: "resaving", statusText: "直近ノートを再保存しています..." });
    chrome.runtime.sendMessage({ type: MSG_RESAVE_LAST }, async (resp) => {
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
    setState({ busyAction: "regenerating-digest", digestStatusText: "digest を再生成しています..." });
    chrome.runtime.sendMessage(
      { type: MSG_REGENERATE_DIGEST, modelId: digestModelSelect.value },
      async (resp) => {
        if (chrome.runtime.lastError) {
          setState({
            busyAction: "",
            digestStatusText: "digest の再生成に失敗しました: " + chrome.runtime.lastError.message
          });
        } else if (!resp?.ok) {
          setState({
            busyAction: "",
            digestStatusText: "digest の再生成に失敗しました: " + (resp?.error || "不明なエラー")
          });
        } else {
          setState({
            busyAction: "",
            digestStatusText: "digest の再生成を開始しました。"
          });
        }
        await syncLastSavedNoteState();
      }
    );
  }

  retryButton.addEventListener("click", doRetryFailedItems);
  resaveButton.addEventListener("click", doResave);
  regenerateDigestButton.addEventListener("click", doRegenerateDigest);

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
      setState({ digestStatusText: msg.text || "" });
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

  await syncRetryState();
  await syncLastSavedNoteState();
  setState({ enabledAIs: getDefaultEnabledAIs() });
  refreshTabStatus();
  promptInput.value = "";
  followUpCheckbox.checked = false;

  const current = await syncTaskState();
  if (current?.prompt) {
    setState({
      statusText: "前回の質問の回答が未取得です。「回答を取得」を押してObsidianに保存してください。"
    });
  } else {
    render();
  }
});