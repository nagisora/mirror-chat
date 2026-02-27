const AI_SERVICES = [
  { id: 'chatgpt', name: 'ChatGPT', url: 'https://chat.openai.com/' },
  { id: 'claude', name: 'Claude', url: 'https://claude.ai/' },
  { id: 'gemini', name: 'Gemini', url: 'https://gemini.google.com/' },
  { id: 'grok', name: 'Grok', url: 'https://grok.x.ai/' }
];

const RESPONSE_TIMEOUT_MS = 120000; // 2分
const STABILITY_DELAY_MS = 3000;   // 回答完了検知用の安定化待機

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_BROADCAST') {
    startBroadcast(message.prompt)
      .then((result) => sendResponse({ success: true, ...result }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
  if (message.type === 'RETRY_SAVE') {
    retryObsidianSave(message.prompt, message.results, message.folderPath)
      .then((saved) => sendResponse({ success: saved }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

async function startBroadcast(prompt) {
  const config = await getConfig();
  const results = {};
  const openedTabs = [];

  try {
    for (const service of AI_SERVICES) {
      const responsePromise = waitForResponse(service.id);
      const tab = await openAndProcessTab(service, prompt, config);
      if (tab) openedTabs.push(tab);

      const response = await responsePromise;
      results[service.id] = {
        name: service.name,
        content: response?.content || null,
        error: response?.error || null
      };

      if (tab?.id) {
        try { await chrome.tabs.remove(tab.id); } catch (_) {}
      }
    }

    const folderPath = buildFolderPath(prompt, config.obsidianPath);
    const saved = await saveToObsidian(prompt, results, folderPath, config);

    if (saved) {
      await showNotification('完了', `4つのAIの回答をObsidianに保存しました。\n${folderPath}`, 'success');
    } else {
      await saveToLocalFallback(prompt, results, folderPath);
      await showNotification('Obsidian保存失敗', 'ローカルに一時保存しました。設定を確認して再送信してください。', 'error');
    }

    return { results, saved };
  } finally {
    for (const tab of openedTabs) {
      try {
        if (tab?.id) await chrome.tabs.remove(tab.id);
      } catch (_) {}
    }
  }
}

async function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get([
      'obsidianPort', 'obsidianToken', 'obsidianPath',
      'chatgptInputSelector', 'chatgptSubmitSelector', 'chatgptResponseSelector',
      'claudeInputSelector', 'claudeSubmitSelector', 'claudeResponseSelector',
      'geminiInputSelector', 'geminiSubmitSelector', 'geminiResponseSelector',
      'grokInputSelector', 'grokSubmitSelector', 'grokResponseSelector'
    ], (result) => {
      resolve({
        obsidianPort: result.obsidianPort || '27124',
        obsidianToken: result.obsidianToken || '',
        obsidianPath: result.obsidianPath || 'AI-Research',
        selectors: {
          chatgpt: {
            input: result.chatgptInputSelector || "textarea[data-id], #prompt-textarea, textarea",
            submit: result.chatgptSubmitSelector || "button[data-testid='send-button'], [data-testid='send-button']",
            response: result.chatgptResponseSelector || "[data-message-author-role='assistant'] .markdown"
          },
          claude: {
            input: result.claudeInputSelector || "[contenteditable='true'], .ProseMirror",
            submit: result.claudeSubmitSelector || "button[type='submit']",
            response: result.claudeResponseSelector || "[data-role='assistant'] .markdown"
          },
          gemini: {
            input: result.geminiInputSelector || "[contenteditable='true'], textarea",
            submit: result.geminiSubmitSelector || "button[aria-label*='Send']",
            response: result.geminiResponseSelector || "[data-message-author-role='model'] .markdown"
          },
          grok: {
            input: result.grokInputSelector || "textarea, [contenteditable='true']",
            submit: result.grokSubmitSelector || "button[type='submit']",
            response: result.grokResponseSelector || "[data-role='assistant'] .markdown"
          }
        }
      });
    });
  });
}

async function openAndProcessTab(service, prompt, config) {
  const tab = await chrome.tabs.create({ url: service.url, active: false });
  await waitForTabLoad(tab.id);

  const selectors = config.selectors[service.id] || {};
  await chrome.tabs.sendMessage(tab.id, {
    type: 'EXECUTE_PROMPT',
    prompt,
    selectors
  });

  return tab;
}

function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    const done = () => {
      chrome.tabs.onUpdated.removeListener(listener);
      setTimeout(resolve, 2500);
    };
    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') done();
    };
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId, (tab) => {
      if (tab?.status === 'complete') done();
    });
  });
}

function waitForResponse(serviceId, tabId) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      chrome.runtime.onMessage.removeListener(handler);
      resolve({ content: null, error: 'タイムアウト' });
    }, RESPONSE_TIMEOUT_MS);

    const handler = (msg) => {
      if (msg.type === 'RESPONSE_READY' && msg.serviceId === serviceId) {
        clearTimeout(timeout);
        chrome.runtime.onMessage.removeListener(handler);
        resolve({ content: msg.content, error: msg.error });
      }
    };

    chrome.runtime.onMessage.addListener(handler);
  });
}

function buildFolderPath(prompt, basePath) {
  const date = new Date().toISOString().slice(0, 10);
  const prefix = prompt.slice(0, 20).replace(/[/\\?%*:|"<>]/g, '_').trim();
  return `${basePath}/${date}_${prefix}`;
}

async function saveToObsidian(prompt, results, folderPath, config) {
  const baseUrl = `http://127.0.0.1:${config.obsidianPort}`;

  const files = [
    { path: `${folderPath}/question.md`, content: `# 質問\n\n${prompt}` },
    { path: `${folderPath}/ChatGPT.md`, content: formatResponse('ChatGPT', results.chatgpt?.content) },
    { path: `${folderPath}/Claude.md`, content: formatResponse('Claude', results.claude?.content) },
    { path: `${folderPath}/Gemini.md`, content: formatResponse('Gemini', results.gemini?.content) },
    { path: `${folderPath}/Grok.md`, content: formatResponse('Grok', results.grok?.content) },
    { path: `${folderPath}/Summary.md`, content: buildSummary(prompt, results) }
  ];

  try {
    for (const file of files) {
      const encodedPath = file.path.split('/').map(encodeURIComponent).join('/');
      const res = await fetch(`${baseUrl}/vault/${encodedPath}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          ...(config.obsidianToken && { 'Authorization': `Bearer ${config.obsidianToken}` })
        },
        body: file.content
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${file.path}`);
    }
    return true;
  } catch (err) {
    console.error('Obsidian save error:', err);
    return false;
  }
}

function formatResponse(name, content) {
  if (!content) return `# ${name}\n\n（取得できませんでした）\n`;
  return `# ${name}\n\n${content}\n`;
}

function buildSummary(prompt, results) {
  const parts = ['# まとめ\n\n', `## 質問\n\n${prompt}\n\n`, '## 各AIの回答\n\n'];
  for (const [id, data] of Object.entries(results)) {
    const name = data?.name || id;
    const content = data?.content || '（取得できませんでした）';
    parts.push(`### ${name}\n\n${content}\n\n---\n\n`);
  }
  return parts.join('');
}

async function saveToLocalFallback(prompt, results, folderPath) {
  const pending = {
    prompt,
    results,
    folderPath,
    timestamp: Date.now()
  };
  const { pendingSaves = [] } = await chrome.storage.local.get('pendingSaves');
  pendingSaves.push(pending);
  await chrome.storage.local.set({ pendingSaves });
}

async function retryObsidianSave(prompt, results, folderPath) {
  const config = await getConfig();
  const saved = await saveToObsidian(prompt, results, folderPath, config);
  if (saved) {
    const { pendingSaves = [] } = await chrome.storage.local.get('pendingSaves');
    const filtered = pendingSaves.filter(p => !(p.folderPath === folderPath && p.prompt === prompt));
    await chrome.storage.local.set({ pendingSaves: filtered });
    await showNotification('再送信完了', `Obsidianに保存しました。\n${folderPath}`, 'success');
  }
  return saved;
}

async function showNotification(title, message, type) {
  const options = {
    type: 'basic',
    iconUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%236366f1"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>',
    title,
    message
  };
  await chrome.notifications.create(options);
}
