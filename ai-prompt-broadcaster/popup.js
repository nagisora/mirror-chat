document.addEventListener('DOMContentLoaded', () => {
  const promptInput = document.getElementById('prompt');
  const submitBtn = document.getElementById('submit');
  const statusEl = document.getElementById('status');

  // 保存されたプロンプトを復元
  chrome.storage.local.get(['lastPrompt'], (result) => {
    if (result.lastPrompt) {
      promptInput.value = result.lastPrompt;
    }
  });

  submitBtn.addEventListener('click', async () => {
    const prompt = promptInput.value.trim();
    if (!prompt) {
      showStatus('質問を入力してください。', 'error');
      return;
    }

    // 設定を確認
    const { obsidianPort, obsidianPath } = await chrome.storage.sync.get(['obsidianPort', 'obsidianPath']);
    if (!obsidianPort || !obsidianPath) {
      showStatus('設定画面でObsidian APIの設定を行ってください。', 'error');
      return;
    }

    // プロンプトを一時保存
    chrome.storage.local.set({ lastPrompt: prompt });

    setLoading(true);
    hideStatus();

    try {
      // Background Workerにメッセージを送信
      chrome.runtime.sendMessage({
        type: 'START_BROADCAST',
        prompt
      }, (response) => {
        setLoading(false);
        if (chrome.runtime.lastError) {
          showStatus('エラー: ' + chrome.runtime.lastError.message, 'error');
          return;
        }
        if (response?.success) {
          showStatus('処理を開始しました。完了時に通知されます。', 'info');
        } else {
          showStatus(response?.error || '処理の開始に失敗しました。', 'error');
        }
      });
    } catch (err) {
      setLoading(false);
      showStatus('エラー: ' + err.message, 'error');
    }
  });

  function setLoading(loading) {
    submitBtn.disabled = loading;
    submitBtn.classList.toggle('loading', loading);
  }

  function showStatus(message, type) {
    statusEl.textContent = message;
    statusEl.className = 'status ' + type;
    statusEl.hidden = false;
  }

  function hideStatus() {
    statusEl.hidden = true;
  }
});
