importScripts("storage.js", "obsidianClient.js");

const AI_KEYS = ["chatgpt", "claude", "gemini", "grok"];
const CONTENT_SCRIPTS = {
  chatgpt: { files: ["content-utils.js", "content-chatgpt.js"] },
  claude: { files: ["content-utils.js", "content-claude.js"] },
  gemini: { files: ["content-utils.js", "content-gemini.js"] },
  grok: { files: ["content-utils.js", "content-grok.js"] }
};
const TASK_TIMEOUT_MS = 120000;
const FAILED_ITEMS_KEY = "mirrorchatFailedItems";

const NOTIFICATION_ICON_URL = chrome.runtime.getURL("icon128.png");

// 開いているAIタブを追跡: { chatgpt: tabId, claude: tabId, ... }
const openTabs = {};
const queue = [];
let processing = false;

function getFolderName(question) {
  const safe = String(question).replace(/[/\\?*:"<>|]/g, "").slice(0, 20);
  const date = new Date().toISOString().slice(0, 10);
  return `${date}_${safe}`;
}

function buildSummary(results) {
  const parts = [];
  for (const { name, markdown } of results) {
    parts.push(`## ${name}\n\n${markdown || "(取得できませんでした)"}\n\n`);
  }
  return parts.join("---\n\n");
}

async function saveToObsidian(question, results, settings) {
  const root = (settings.obsidian?.rootPath || "AI-Research").replace(/\/$/, "");
  const folder = getFolderName(question);
  const basePath = `${root}/${folder}`;
  const { baseUrl, token } = settings.obsidian || {};

  if (!baseUrl) {
    return { ok: false, error: "ObsidianのベースURLが設定されていません" };
  }

  const files = [
    { path: `${basePath}/question.md`, content: question },
    ...results.map((r) => ({ path: `${basePath}/${r.name}.md`, content: r.markdown || "" })),
    { path: `${basePath}/Summary.md`, content: buildSummary(results) }
  ];

  for (const f of files) {
    const res = await self.ObsidianClient.createNote(baseUrl, token, f.path, f.content);
    if (!res.ok) {
      return { ok: false, error: res.error, payload: { question, results, basePath } };
    }
  }
  return { ok: true };
}

async function saveFailedToLocal(payload) {
  const items = await new Promise((r) =>
    chrome.storage.local.get(FAILED_ITEMS_KEY, (x) => r(x[FAILED_ITEMS_KEY] || []))
  );
  items.push({ ...payload, ts: Date.now() });
  await new Promise((r) => chrome.storage.local.set({ [FAILED_ITEMS_KEY]: items }, r));
}

function notifyAIStatus(ai, state) {
  chrome.runtime.sendMessage?.({ type: "MIRRORCHAT_AI_STATUS", ai, state });
}

// タブが閉じられたら追跡から削除
chrome.tabs.onRemoved.addListener((tabId) => {
  for (const key of AI_KEYS) {
    if (openTabs[key] === tabId) {
      delete openTabs[key];
      notifyAIStatus(key, "");
      break;
    }
  }
});

async function openAITabs() {
  const settings = await self.MirrorChatStorage.getSettings();
  for (const aiKey of AI_KEYS) {
    const cfg = settings.aiConfigs?.[aiKey];
    const url = cfg?.url || "";
    if (!url) continue;

    // 既に開いているタブがあるか確認
    if (openTabs[aiKey]) {
      try {
        await new Promise((resolve, reject) => {
          chrome.tabs.get(openTabs[aiKey], (tab) => {
            if (chrome.runtime.lastError || !tab) {
              reject(new Error("tab not found"));
            } else {
              resolve(tab);
            }
          });
        });
        continue; // タブはまだ存在するのでスキップ
      } catch {
        delete openTabs[aiKey];
      }
    }

    const tab = await new Promise((resolve) => {
      chrome.tabs.create({ url, active: false }, (t) => {
        if (chrome.runtime.lastError) {
          resolve(null);
        } else {
          resolve(t);
        }
      });
    });

    if (tab) {
      openTabs[aiKey] = tab.id;
      notifyAIStatus(aiKey, "open");
    }
  }
  return { ...openTabs };
}

function closeAITabs() {
  for (const aiKey of AI_KEYS) {
    if (openTabs[aiKey]) {
      chrome.tabs.remove(openTabs[aiKey], () => {
        void chrome.runtime.lastError;
      });
      delete openTabs[aiKey];
      notifyAIStatus(aiKey, "");
    }
  }
}

async function processOneTask(aiKey, prompt, settings) {
  const cfg = settings.aiConfigs?.[aiKey];
  const tabId = openTabs[aiKey];

  if (!tabId) {
    return { ai: aiKey, name: cfg?.name || aiKey, markdown: "", error: "タブが開いていません" };
  }

  notifyAIStatus(aiKey, "sending");

  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      notifyAIStatus(aiKey, "error");
      resolve({
        ai: aiKey,
        name: cfg?.name || aiKey,
        markdown: "",
        error: "タイムアウト"
      });
    }, TASK_TIMEOUT_MS);

    chrome.scripting.executeScript(
      { target: { tabId }, files: CONTENT_SCRIPTS[aiKey].files },
      () => {
        if (chrome.runtime.lastError) {
          clearTimeout(timeoutId);
          notifyAIStatus(aiKey, "error");
          resolve({
            ai: aiKey,
            name: cfg?.name || aiKey,
            markdown: "",
            error: chrome.runtime.lastError.message
          });
          return;
        }

        chrome.tabs.sendMessage(
          tabId,
          { type: "MIRRORCHAT_START", prompt, config: cfg },
          (response) => {
            clearTimeout(timeoutId);
            if (chrome.runtime.lastError) {
              notifyAIStatus(aiKey, "error");
              resolve({
                ai: aiKey,
                name: cfg?.name || aiKey,
                markdown: "",
                error: chrome.runtime.lastError.message
              });
              return;
            }
            const data = response || {};
            notifyAIStatus(aiKey, data.error ? "error" : "done");
            resolve({
              ai: aiKey,
              name: cfg?.name || aiKey,
              markdown: data.markdown || "",
              error: data.error
            });
          }
        );
      }
    );
  });
}

async function runTask(task) {
  const settings = await self.MirrorChatStorage.getSettings();
  let results;

  if (task.retryPayload?.results) {
    results = task.retryPayload.results;
  } else {
    results = [];
    for (const aiKey of AI_KEYS) {
      if (!openTabs[aiKey]) {
        const cfg = settings.aiConfigs?.[aiKey];
        results.push({
          ai: aiKey,
          name: cfg?.name || aiKey,
          markdown: "",
          error: "タブが開いていません"
        });
        notifyAIStatus(aiKey, "error");
        continue;
      }
      const r = await processOneTask(aiKey, task.prompt, settings);
      results.push(r);
    }
  }

  const saveResult = await saveToObsidian(task.prompt, results, settings);
  if (!saveResult.ok) {
    await saveFailedToLocal({
      question: task.prompt,
      results,
      error: saveResult.error
    });
    const failed = results.filter((r) => r.error).map((r) => r.name);
    chrome.notifications.create(
      "",
      {
        type: "basic",
        iconUrl: NOTIFICATION_ICON_URL,
        title: "MirrorChat: 一部失敗",
        message: `Obsidian保存失敗。失敗: ${failed.join(", ")}。再送可能です。`
      },
      () => {
        if (chrome.runtime.lastError) {
          console.error("MirrorChat notification error:", chrome.runtime.lastError.message);
        }
      }
    );
  } else {
    const failed = results.filter((r) => r.error).map((r) => r.name);
    if (failed.length > 0) {
      chrome.notifications.create(
        "",
        {
          type: "basic",
          iconUrl: NOTIFICATION_ICON_URL,
          title: "MirrorChat: 一部失敗",
          message: `取得失敗: ${failed.join(", ")}。Obsidianには保存済みです。`
        },
        () => {
          if (chrome.runtime.lastError) {
            console.error("MirrorChat notification error:", chrome.runtime.lastError.message);
          }
        }
      );
    } else {
      chrome.notifications.create(
        "",
        {
          type: "basic",
          iconUrl: NOTIFICATION_ICON_URL,
          title: "MirrorChat: 完了",
          message: "4つのAIから回答を取得し、Obsidianに保存しました。"
        },
        () => {
          if (chrome.runtime.lastError) {
            console.error("MirrorChat notification error:", chrome.runtime.lastError.message);
          }
        }
      );
    }
  }

  chrome.runtime.sendMessage?.({ type: "MIRRORCHAT_DONE" });
  processNext();
}

function processNext() {
  if (queue.length === 0) {
    processing = false;
    return;
  }
  processing = true;
  const task = queue.shift();
  runTask(task).catch((err) => {
    console.error("MirrorChat task error:", err);
    processNext();
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "MIRRORCHAT_OPEN_TABS") {
    openAITabs().then((tabs) => {
      sendResponse({ ok: true, openTabs: tabs });
    });
    return true;
  }

  if (msg.type === "MIRRORCHAT_CLOSE_TABS") {
    closeAITabs();
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === "MIRRORCHAT_GET_TAB_STATUS") {
    // 開いているタブの状態を返す（ポップアップ再表示時の復帰用）
    const validTabs = {};
    const checks = AI_KEYS.map((key) => {
      if (!openTabs[key]) return Promise.resolve();
      return new Promise((resolve) => {
        chrome.tabs.get(openTabs[key], (tab) => {
          if (chrome.runtime.lastError || !tab) {
            delete openTabs[key];
          } else {
            validTabs[key] = openTabs[key];
          }
          resolve();
        });
      });
    });
    Promise.all(checks).then(() => {
      sendResponse({ openTabs: validTabs });
    });
    return true;
  }

  if (msg.type === "MIRRORCHAT_SEND") {
    queue.push({ prompt: msg.prompt });
    if (!processing) processNext();
    sendResponse({ ok: true });
  } else if (msg.type === "MIRRORCHAT_RETRY") {
    chrome.storage.local.get(FAILED_ITEMS_KEY, (x) => {
      const items = x[FAILED_ITEMS_KEY] || [];
      chrome.storage.local.set({ [FAILED_ITEMS_KEY]: [] });
      items.forEach((it) => queue.push({ prompt: it.question, retryPayload: it }));
      if (!processing && queue.length > 0) processNext();
    });
    sendResponse({ ok: true });
  }
  return true;
});
