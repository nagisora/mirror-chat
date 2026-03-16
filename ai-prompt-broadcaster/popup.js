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
    // ここでの失敗は致命的ではないので、通常のポップアップとして続行する
    console.warn("MirrorChat: standalone モードへの切り替えに失敗しました:", e);
  }

  const promptInput = document.getElementById("prompt-input");
  const followUpCheckbox = document.getElementById("follow-up-checkbox");
  const sendButton = document.getElementById("send-button");
  const collectButton = document.getElementById("collect-button");
  const openTabsButton = document.getElementById("open-tabs-button");
  const closeTabsButton = document.getElementById("close-tabs-button");
  const status = document.getElementById("status");
  const retrySection = document.getElementById("retry-section");
  const retryButton = document.getElementById("retry-button");
  const resaveButton = document.getElementById("resave-button");

  // constants.js が先に読み込まれる前提。フォールバックは念のため。
  const AI_KEYS = window.MirrorChatConstants?.AI_KEYS ?? ["chatgpt", "claude", "gemini", "grok"];
  const indicators = {};
  AI_KEYS.forEach((key) => {
    indicators[key] = document.getElementById("ind-" + key);
  });

  function setIndicator(aiKey, state) {
    const el = indicators[aiKey];
    if (!el) return;
    el.className = "indicator";
    if (state) el.classList.add(state);
  }

  function updateTabUI(openTabs, hasPendingQuestion = false) {
    const hasOpen = openTabs && Object.keys(openTabs).length > 0;
    AI_KEYS.forEach((key) => {
      setIndicator(key, openTabs && openTabs[key] ? "open" : "");
    });
    closeTabsButton.disabled = !hasOpen;
    openTabsButton.disabled = hasOpen;
    if (hasPendingQuestion) {
      sendButton.disabled = true;
      collectButton.disabled = !hasOpen;
    } else {
      sendButton.disabled = !hasOpen;
      collectButton.disabled = true;
    }
  }

  function refreshTabStatus() {
    const currentTaskKey = window.MirrorChatConstants?.STORAGE_KEYS?.CURRENT_TASK ?? "mirrorchatCurrentTask";
    chrome.runtime.sendMessage({ type: "MIRRORCHAT_GET_TAB_STATUS" }, (resp) => {
      if (chrome.runtime.lastError) return;
      chrome.storage.local.get(currentTaskKey, (data) => {
        const current = data?.[currentTaskKey];
        const hasPendingQuestion = !!(current?.prompt);
        updateTabUI(resp?.openTabs, hasPendingQuestion);
      });
    });
  }

  openTabsButton.addEventListener("click", () => {
    openTabsButton.disabled = true;
    status.textContent = "AIサイトを開いています...";
    chrome.runtime.sendMessage({ type: "MIRRORCHAT_OPEN_TABS" }, (resp) => {
      if (chrome.runtime.lastError) {
        status.textContent = "タブを開けませんでした: " + chrome.runtime.lastError.message;
        openTabsButton.disabled = false;
        return;
      }
      status.textContent = "AIサイトを開きました。ログイン等を済ませてから質問を送信してください。";
      updateTabUI(resp?.openTabs);
    });
  });

  closeTabsButton.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "MIRRORCHAT_CLOSE_TABS" }, () => {
      if (chrome.runtime.lastError) return;
      status.textContent = "AIサイトのタブを閉じました。";
      updateTabUI(null);
    });
  });

  sendButton.addEventListener("click", async () => {
    const text = promptInput.value.trim();
    if (!text) {
      status.textContent = "質問を入力してください。";
      return;
    }
    const isFollowUp = followUpCheckbox.checked;
    if (isFollowUp) {
      status.textContent = "続きの質問を送信中...各AIの既存会話に追加されます。回答生成完了後に「回答を取得」を押してください。";
    } else {
      status.textContent = "送信中...各AIに質問を送っています。回答生成完了後に「回答を取得」を押してください。";
    }
    // 一度送信した質問が処理中の間は、新しい送信は行わない
    sendButton.disabled = true;
    collectButton.disabled = false;

    AI_KEYS.forEach((key) => setIndicator(key, "sending"));

    chrome.runtime.sendMessage({ type: "MIRRORCHAT_SEND", prompt: text, isFollowUp }, (resp) => {
      if (chrome.runtime.lastError) {
        status.textContent = "送信に失敗しました: " + chrome.runtime.lastError.message;
        sendButton.disabled = false;
        collectButton.disabled = true;
        return;
      }
      if (!resp || !resp.ok) {
        status.textContent = "送信に失敗しました: " + (resp?.error || "不明なエラー");
        sendButton.disabled = false;
        collectButton.disabled = true;
        return;
      }
      status.textContent = "送信が完了しました。各AIの回答が出揃ったら「回答を取得」を押してください。";
    });
  });

  collectButton.addEventListener("click", () => {
    collectButton.disabled = true;
    status.textContent = "回答を取得中です。タブを順番にフォーカスしてテキストを収集します...";
    chrome.runtime.sendMessage({ type: "MIRRORCHAT_FETCH" }, (resp) => {
      if (chrome.runtime.lastError) {
        status.textContent = "回答取得の開始に失敗しました: " + chrome.runtime.lastError.message;
        collectButton.disabled = false;
        return;
      }
      if (!resp || !resp.ok) {
        status.textContent = "回答取得の開始に失敗しました: " + (resp?.error || "不明なエラー");
        collectButton.disabled = false;
        return;
      }
      // 実際の取得完了は MIRRORCHAT_DONE で通知される
      status.textContent = "回答取得を開始しました。バックグラウンドで順次処理されます。";
    });
  });

  function doResave() {
    resaveButton.disabled = true;
    retryButton.disabled = true;
    status.textContent = "再保存中...";
    chrome.runtime.sendMessage({ type: "MIRRORCHAT_RETRY" }, () => {
      if (chrome.runtime.lastError) {
        status.textContent = "再保存に失敗しました: " + chrome.runtime.lastError.message;
      } else {
        status.textContent = "再保存を開始しました。";
      }
      updateRetryVisibility();
    });
  }

  retryButton.addEventListener("click", doResave);
  resaveButton.addEventListener("click", doResave);

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "MIRRORCHAT_STATUS") {
      status.textContent = msg.text || "";
    }
    if (msg.type === "MIRRORCHAT_AI_STATUS") {
      setIndicator(msg.ai, msg.state);
    }
    if (msg.type === "MIRRORCHAT_DONE") {
      updateRetryVisibility();
      sendButton.disabled = false;
      // 保存失敗時は「回答を取得」を有効のままにして再試行可能にする
      collectButton.disabled = !msg.saveFailed;
      refreshTabStatus();
    }
  });

  async function updateRetryVisibility() {
    const key = window.MirrorChatConstants?.STORAGE_KEYS?.FAILED_ITEMS ?? "mirrorchatFailedItems";
    const items = await new Promise((resolve) =>
      chrome.storage.local.get(key, (x) => resolve(x[key] || []))
    );
    const hasFailedItems = items.length > 0;
    retrySection.hidden = !hasFailedItems;
    resaveButton.disabled = !hasFailedItems;
  }

  updateRetryVisibility();
  refreshTabStatus();

  // 直前の質問が未取得のまま残っている場合は、入力欄とステータスを復元する（ボタン状態は refreshTabStatus で設定）
  const currentTaskKey = window.MirrorChatConstants?.STORAGE_KEYS?.CURRENT_TASK ?? "mirrorchatCurrentTask";
  chrome.storage.local.get(currentTaskKey, (data) => {
    const current = data?.[currentTaskKey];
    if (current?.prompt) {
      promptInput.value = current.prompt;
      followUpCheckbox.checked = !!current.isFollowUp;
      status.textContent = "前回の質問の回答が未取得です。「回答を取得」を押してObsidianに保存してください。";
    }
  });
});
