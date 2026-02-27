document.addEventListener("DOMContentLoaded", async () => {
  const promptInput = document.getElementById("prompt-input");
  const sendButton = document.getElementById("send-button");
  const openTabsButton = document.getElementById("open-tabs-button");
  const closeTabsButton = document.getElementById("close-tabs-button");
  const status = document.getElementById("status");
  const retrySection = document.getElementById("retry-section");
  const retryButton = document.getElementById("retry-button");

  const AI_KEYS = ["chatgpt", "claude", "gemini", "grok"];
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

  function updateTabUI(openTabs) {
    const hasOpen = openTabs && Object.keys(openTabs).length > 0;
    AI_KEYS.forEach((key) => {
      setIndicator(key, openTabs && openTabs[key] ? "open" : "");
    });
    sendButton.disabled = !hasOpen;
    closeTabsButton.disabled = !hasOpen;
    openTabsButton.disabled = hasOpen;
  }

  function refreshTabStatus() {
    chrome.runtime.sendMessage({ type: "MIRRORCHAT_GET_TAB_STATUS" }, (resp) => {
      if (chrome.runtime.lastError) return;
      updateTabUI(resp?.openTabs);
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
    sendButton.disabled = true;
    status.textContent = "送信中...各AIに質問を送っています。";

    AI_KEYS.forEach((key) => setIndicator(key, "sending"));

    chrome.runtime.sendMessage({ type: "MIRRORCHAT_SEND", prompt: text });
    status.textContent = "送信を開始しました。バックグラウンドで順次処理されます。";
  });

  retryButton.addEventListener("click", async () => {
    retryButton.disabled = true;
    status.textContent = "再送信中...";
    try {
      chrome.runtime.sendMessage({ type: "MIRRORCHAT_RETRY" });
      status.textContent = "再送信を開始しました。";
    } catch (e) {
      status.textContent = "再送信に失敗しました: " + (e.message || e);
    }
    retryButton.disabled = false;
  });

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
      refreshTabStatus();
    }
  });

  async function updateRetryVisibility() {
    const items = await new Promise((r) =>
      chrome.storage.local.get("mirrorchatFailedItems", (x) => r(x.mirrorchatFailedItems || []))
    );
    retrySection.hidden = items.length === 0;
  }

  updateRetryVisibility();
  refreshTabStatus();
});
