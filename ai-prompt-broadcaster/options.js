const DEFAULT_SELECTORS = {
  chatgpt: {
    input: "textarea[data-id], #prompt-textarea, textarea",
    submit: "button[data-testid='send-button'], [data-testid='send-button'], button[aria-label*='Send']",
    response: "[data-message-author-role='assistant'] .markdown, [data-message-author-role='assistant'], .markdown"
  },
  claude: {
    input: "[contenteditable='true'][data-placeholder], .ProseMirror, [contenteditable='true']",
    submit: "button[type='submit'], [aria-label='Send message']",
    response: "[data-role='assistant'] .markdown, [data-role='assistant'], .markdown"
  },
  gemini: {
    input: "[contenteditable='true'], textarea, .ql-editor",
    submit: "button[aria-label*='Send'], button.send",
    response: "[data-message-author-role='model'], .model-response .markdown, .markdown"
  },
  grok: {
    input: "textarea, [contenteditable='true']",
    submit: "button[type='submit'], button.send",
    response: "[data-role='assistant'], .response-content, .markdown"
  }
};

document.addEventListener('DOMContentLoaded', () => {
  loadOptions();
  loadPendingSaves();

  document.getElementById('optionsForm').addEventListener('submit', (e) => {
    e.preventDefault();
    saveOptions();
  });

  document.getElementById('resetSelectors').addEventListener('click', () => {
    resetSelectors();
  });
});

async function loadPendingSaves() {
  const { pendingSaves = [] } = await chrome.storage.local.get('pendingSaves');
  const container = document.getElementById('pendingSaves');
  if (pendingSaves.length === 0) {
    container.innerHTML = '<div class="pending-empty">保存に失敗したデータはありません</div>';
    return;
  }
  container.innerHTML = pendingSaves.map((item, i) => `
    <div class="pending-item" data-index="${i}">
      <div class="prompt-preview">${escapeHtml(item.prompt?.slice(0, 50) || '')}${(item.prompt?.length || 0) > 50 ? '...' : ''}</div>
      <div class="meta">${item.folderPath || ''} · ${new Date(item.timestamp).toLocaleString('ja-JP')}</div>
      <button type="button" class="btn-retry" data-index="${i}">Obsidianに再送信</button>
    </div>
  `).join('');
  container.querySelectorAll('.btn-retry').forEach(btn => {
    btn.addEventListener('click', () => retrySave(parseInt(btn.dataset.index)));
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function retrySave(index) {
  const { pendingSaves = [] } = await chrome.storage.local.get('pendingSaves');
  const item = pendingSaves[index];
  if (!item) return;
  showStatus('再送信を開始しました...', 'success');
  chrome.runtime.sendMessage({
    type: 'RETRY_SAVE',
    prompt: item.prompt,
    results: item.results,
    folderPath: item.folderPath,
    index
  }, async (response) => {
    if (response?.success) {
      pendingSaves.splice(index, 1);
      await chrome.storage.local.set({ pendingSaves });
      loadPendingSaves();
      showStatus('Obsidianに保存しました。', 'success');
    } else {
      showStatus(response?.error || '保存に失敗しました。', 'error');
    }
  });
}

function loadOptions() {
  chrome.storage.sync.get([
    'obsidianPort', 'obsidianToken', 'obsidianPath',
    'chatgptInputSelector', 'chatgptSubmitSelector', 'chatgptResponseSelector',
    'claudeInputSelector', 'claudeSubmitSelector', 'claudeResponseSelector',
    'geminiInputSelector', 'geminiSubmitSelector', 'geminiResponseSelector',
    'grokInputSelector', 'grokSubmitSelector', 'grokResponseSelector'
  ], (result) => {
    document.getElementById('obsidianPort').value = result.obsidianPort || '27124';
    document.getElementById('obsidianToken').value = result.obsidianToken || '';
    document.getElementById('obsidianPath').value = result.obsidianPath || 'AI-Research';

    document.getElementById('chatgptInputSelector').value = result.chatgptInputSelector || DEFAULT_SELECTORS.chatgpt.input;
    document.getElementById('chatgptSubmitSelector').value = result.chatgptSubmitSelector || DEFAULT_SELECTORS.chatgpt.submit;
    document.getElementById('chatgptResponseSelector').value = result.chatgptResponseSelector || DEFAULT_SELECTORS.chatgpt.response;

    document.getElementById('claudeInputSelector').value = result.claudeInputSelector || DEFAULT_SELECTORS.claude.input;
    document.getElementById('claudeSubmitSelector').value = result.claudeSubmitSelector || DEFAULT_SELECTORS.claude.submit;
    document.getElementById('claudeResponseSelector').value = result.claudeResponseSelector || DEFAULT_SELECTORS.claude.response;

    document.getElementById('geminiInputSelector').value = result.geminiInputSelector || DEFAULT_SELECTORS.gemini.input;
    document.getElementById('geminiSubmitSelector').value = result.geminiSubmitSelector || DEFAULT_SELECTORS.gemini.submit;
    document.getElementById('geminiResponseSelector').value = result.geminiResponseSelector || DEFAULT_SELECTORS.gemini.response;

    document.getElementById('grokInputSelector').value = result.grokInputSelector || DEFAULT_SELECTORS.grok.input;
    document.getElementById('grokSubmitSelector').value = result.grokSubmitSelector || DEFAULT_SELECTORS.grok.submit;
    document.getElementById('grokResponseSelector').value = result.grokResponseSelector || DEFAULT_SELECTORS.grok.response;
  });
}

function saveOptions() {
  const options = {
    obsidianPort: document.getElementById('obsidianPort').value || '27124',
    obsidianToken: document.getElementById('obsidianToken').value,
    obsidianPath: document.getElementById('obsidianPath').value.trim() || 'AI-Research',
    chatgptInputSelector: document.getElementById('chatgptInputSelector').value.trim(),
    chatgptSubmitSelector: document.getElementById('chatgptSubmitSelector').value.trim(),
    chatgptResponseSelector: document.getElementById('chatgptResponseSelector').value.trim(),
    claudeInputSelector: document.getElementById('claudeInputSelector').value.trim(),
    claudeSubmitSelector: document.getElementById('claudeSubmitSelector').value.trim(),
    claudeResponseSelector: document.getElementById('claudeResponseSelector').value.trim(),
    geminiInputSelector: document.getElementById('geminiInputSelector').value.trim(),
    geminiSubmitSelector: document.getElementById('geminiSubmitSelector').value.trim(),
    geminiResponseSelector: document.getElementById('geminiResponseSelector').value.trim(),
    grokInputSelector: document.getElementById('grokInputSelector').value.trim(),
    grokSubmitSelector: document.getElementById('grokSubmitSelector').value.trim(),
    grokResponseSelector: document.getElementById('grokResponseSelector').value.trim()
  };

  chrome.storage.sync.set(options, () => {
    showStatus('設定を保存しました。', 'success');
  });
}

function resetSelectors() {
  document.getElementById('chatgptInputSelector').value = DEFAULT_SELECTORS.chatgpt.input;
  document.getElementById('chatgptSubmitSelector').value = DEFAULT_SELECTORS.chatgpt.submit;
  document.getElementById('chatgptResponseSelector').value = DEFAULT_SELECTORS.chatgpt.response;

  document.getElementById('claudeInputSelector').value = DEFAULT_SELECTORS.claude.input;
  document.getElementById('claudeSubmitSelector').value = DEFAULT_SELECTORS.claude.submit;
  document.getElementById('claudeResponseSelector').value = DEFAULT_SELECTORS.claude.response;

  document.getElementById('geminiInputSelector').value = DEFAULT_SELECTORS.gemini.input;
  document.getElementById('geminiSubmitSelector').value = DEFAULT_SELECTORS.gemini.submit;
  document.getElementById('geminiResponseSelector').value = DEFAULT_SELECTORS.gemini.response;

  document.getElementById('grokInputSelector').value = DEFAULT_SELECTORS.grok.input;
  document.getElementById('grokSubmitSelector').value = DEFAULT_SELECTORS.grok.submit;
  document.getElementById('grokResponseSelector').value = DEFAULT_SELECTORS.grok.response;

  showStatus('セレクタをデフォルトに戻しました。保存ボタンで確定してください。', 'success');
}

function showStatus(message, type) {
  const statusEl = document.getElementById('saveStatus');
  statusEl.textContent = message;
  statusEl.className = 'status ' + type;
  statusEl.hidden = false;

  setTimeout(() => {
    statusEl.hidden = true;
  }, 3000);
}
