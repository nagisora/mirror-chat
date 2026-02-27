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

const queue = [];
let processing = false;

function getFolderName(question) {
  const safe = String(question).replace(/[/\\?*:"<>|]/g, "").slice(0, 20);
  const date = new Date().toISOString().slice(0, 10);
  return `${date}_${safe}`;
}

function buildSummary(results) {
  const parts = [];
  for (const { ai, name, markdown } of results) {
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

async function processOneTask(aiKey, prompt, settings) {
  const cfg = settings.aiConfigs?.[aiKey];
  const url = cfg?.url || "";
  if (!url) return { ai: aiKey, name: cfg?.name || aiKey, markdown: "", error: "URL未設定" };

  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      resolve({
        ai: aiKey,
        name: cfg?.name || aiKey,
        markdown: "",
        error: "タイムアウト"
      });
    }, TASK_TIMEOUT_MS);

    chrome.tabs.create({ url, active: true }, (tab) => {
      if (chrome.runtime.lastError) {
        clearTimeout(timeoutId);
        resolve({
          ai: aiKey,
          name: cfg?.name || aiKey,
          markdown: "",
          error: chrome.runtime.lastError.message
        });
        return;
      }

      const onUpdated = (id, info) => {
        if (id !== tab.id || info.status !== "complete") return;
        chrome.tabs.onUpdated.removeListener(onUpdated);

        chrome.scripting.executeScript(
          { target: { tabId: tab.id }, files: CONTENT_SCRIPTS[aiKey].files },
          () => {
            if (chrome.runtime.lastError) {
              clearTimeout(timeoutId);
              chrome.tabs.remove(tab.id);
              resolve({
                ai: aiKey,
                name: cfg?.name || aiKey,
                markdown: "",
                error: chrome.runtime.lastError.message
              });
              return;
            }

            chrome.tabs.sendMessage(
              tab.id,
              { type: "MIRRORCHAT_START", prompt, config: cfg },
              (response) => {
                clearTimeout(timeoutId);
                chrome.tabs.remove(tab.id);
                if (chrome.runtime.lastError) {
                  resolve({
                    ai: aiKey,
                    name: cfg?.name || aiKey,
                    markdown: "",
                    error: chrome.runtime.lastError.message
                  });
                  return;
                }
                const data = response || {};
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
      };

      chrome.tabs.onUpdated.addListener(onUpdated);
    });
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
    chrome.notifications.create({
      type: "basic",
      title: "MirrorChat: 一部失敗",
      message: `Obsidian保存失敗。失敗: ${failed.join(", ")}。再送可能です。`
    });
  } else {
    const failed = results.filter((r) => r.error).map((r) => r.name);
    if (failed.length > 0) {
      chrome.notifications.create({
        type: "basic",
        title: "MirrorChat: 一部失敗",
        message: `取得失敗: ${failed.join(", ")}。Obsidianには保存済みです。`
      });
    } else {
      chrome.notifications.create({
        type: "basic",
        title: "MirrorChat: 完了",
        message: "4つのAIから回答を取得し、Obsidianに保存しました。"
      });
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
