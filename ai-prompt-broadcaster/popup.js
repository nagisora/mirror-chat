document.addEventListener("DOMContentLoaded", async () => {
  const promptInput = document.getElementById("prompt-input");
  const sendButton = document.getElementById("send-button");
  const status = document.getElementById("status");
  const retrySection = document.getElementById("retry-section");
  const retryButton = document.getElementById("retry-button");

  const storage = window.MirrorChatStorage;

  async function updateRetryVisibility() {
    const items = await new Promise((r) =>
      chrome.storage.local.get("mirrorchatFailedItems", (x) => r(x.mirrorchatFailedItems || []))
    );
    retrySection.hidden = items.length === 0;
  }

  sendButton.addEventListener("click", async () => {
    const text = promptInput.value.trim();
    if (!text) {
      status.textContent = "質問を入力してください。";
      return;
    }
    sendButton.disabled = true;
    status.textContent = "送信中...";
    try {
      chrome.runtime.sendMessage({ type: "MIRRORCHAT_SEND", prompt: text });
      status.textContent = "キューに追加しました。バックグラウンドで順次処理されます。";
    } catch (e) {
      status.textContent = "送信に失敗しました: " + (e.message || e);
    }
    sendButton.disabled = false;
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
    if (msg.type === "MIRRORCHAT_DONE") {
      updateRetryVisibility();
    }
  });

  updateRetryVisibility();
});
