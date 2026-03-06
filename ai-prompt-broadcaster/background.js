importScripts("constants.js", "storage.js", "obsidianClient.js");

const { AI_KEYS, STORAGE_KEYS, TIMEOUT_MS, CONTENT_SCRIPTS } = self.MirrorChatConstants;
const TASK_TIMEOUT_MS = TIMEOUT_MS.TASK;
const FAILED_ITEMS_KEY = STORAGE_KEYS.FAILED_ITEMS;
const CURRENT_TASK_KEY = STORAGE_KEYS.CURRENT_TASK;
const FOCUS_DELAY_MS = TIMEOUT_MS.FOCUS_DELAY;

const NOTIFICATION_ICON_URL = chrome.runtime.getURL("icon128.png");

function showNotification(title, message) {
  chrome.notifications.create(
    "",
    { type: "basic", iconUrl: NOTIFICATION_ICON_URL, title, message },
    () => {
      if (chrome.runtime.lastError) {
        console.error("MirrorChat notification error:", chrome.runtime.lastError.message);
      }
    }
  );
}

// 開いているAIタブを追跡: { chatgpt: tabId, claude: tabId, ... }
const aiTabIds = {};
const queue = [];
let processing = false;

function getObsidianFolderName(question) {
  const cleaned = String(question)
    .replace(/[\r\n]/g, " ")
    .replace(/[/\\?*:"<>|.]/g, "");
  const safe = Array.from(cleaned.trim())
    .slice(0, 20)
    .join("") || "q";
  const date = new Date().toISOString().slice(0, 10);
  const hash = Date.now().toString(36).slice(-6);
  return `${date}_${safe}_${hash}`;
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
  const folder = getObsidianFolderName(question);
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

async function appendFailedItemToLocal(payload) {
  const items = await new Promise((resolve) =>
    chrome.storage.local.get(FAILED_ITEMS_KEY, (x) => resolve(x[FAILED_ITEMS_KEY] || []))
  );
  items.push({ ...payload, ts: Date.now() });
  await new Promise((resolve) => chrome.storage.local.set({ [FAILED_ITEMS_KEY]: items }, resolve));
}

function notifyAIStatus(ai, state) {
  chrome.runtime.sendMessage?.({ type: "MIRRORCHAT_AI_STATUS", ai, state });
}

// タブが閉じられたら追跡から削除
chrome.tabs.onRemoved.addListener((tabId) => {
  for (const key of AI_KEYS) {
    if (aiTabIds[key] === tabId) {
      delete aiTabIds[key];
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
    if (aiTabIds[aiKey]) {
      try {
        await new Promise((resolve, reject) => {
          chrome.tabs.get(aiTabIds[aiKey], (tab) => {
            if (chrome.runtime.lastError || !tab) {
              reject(new Error("tab not found"));
            } else {
              resolve(tab);
            }
          });
        });
        continue; // タブはまだ存在するのでスキップ
      } catch {
        delete aiTabIds[aiKey];
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
      aiTabIds[aiKey] = tab.id;
      notifyAIStatus(aiKey, "open");
    }
  }
  return { ...aiTabIds };
}

function closeAITabs() {
  for (const aiKey of AI_KEYS) {
    if (aiTabIds[aiKey]) {
      chrome.tabs.remove(aiTabIds[aiKey], () => {
        void chrome.runtime.lastError;
      });
      delete aiTabIds[aiKey];
      notifyAIStatus(aiKey, "");
    }
  }
}

async function focusMirrorChatTab() {
  return new Promise((resolve) => {
    try {
      const baseUrl = chrome.runtime.getURL("popup.html");
      const pattern = `${baseUrl}*`;
      chrome.tabs.query({ url: pattern }, (tabs) => {
        if (chrome.runtime.lastError || !tabs || tabs.length === 0) {
          resolve();
          return;
        }
        const tab = tabs[0];
        if (!tab || !tab.id) {
          resolve();
          return;
        }
        const windowId = tab.windowId;
        if (windowId) {
          chrome.windows.update(windowId, { focused: true }, () => {
            void chrome.runtime.lastError;
            chrome.tabs.update(tab.id, { active: true }, () => {
              void chrome.runtime.lastError;
              resolve();
            });
          });
        } else {
          chrome.tabs.update(tab.id, { active: true }, () => {
            void chrome.runtime.lastError;
            resolve();
          });
        }
      });
    } catch (e) {
      // ここでの失敗は致命的でないので無視
      resolve();
    }
  });
}

async function sendPromptToAI(aiKey, prompt, settings) {
  const cfg = settings.aiConfigs?.[aiKey];
  const tabId = aiTabIds[aiKey];

  if (!tabId) {
    notifyAIStatus(aiKey, "error");
    return {
      ai: aiKey,
      name: cfg?.name || aiKey,
      ok: false,
      error: "タブが開いていません"
    };
  }

  notifyAIStatus(aiKey, "sending");

  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      notifyAIStatus(aiKey, "error");
      resolve({
        ai: aiKey,
        name: cfg?.name || aiKey,
        ok: false,
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
            ok: false,
            error: chrome.runtime.lastError.message
          });
          return;
        }

        chrome.tabs.sendMessage(
          tabId,
          { type: "MIRRORCHAT_SEND_ONLY", prompt, config: cfg },
          (response) => {
            clearTimeout(timeoutId);
            if (chrome.runtime.lastError) {
              notifyAIStatus(aiKey, "error");
              resolve({
                ai: aiKey,
                name: cfg?.name || aiKey,
                ok: false,
                error: chrome.runtime.lastError.message
              });
              return;
            }
            const data = response || {};
            // 送信フェーズでは done/error の区別だけ行う
            notifyAIStatus(aiKey, data.error ? "error" : "sending");
            resolve({
              ai: aiKey,
              name: cfg?.name || aiKey,
              ok: !data.error,
              error: data.error
            });
          }
        );
      }
    );
  });
}

async function processOneTask(aiKey, prompt, settings) {
  const cfg = settings.aiConfigs?.[aiKey];
  const tabId = aiTabIds[aiKey];

  if (!tabId) {
    return { ai: aiKey, name: cfg?.name || aiKey, markdown: "", error: "タブが開いていません" };
  }

  // 回答取得フェーズでは、クリップボードAPI等の制約のためタブにフォーカスを当てる
  notifyAIStatus(aiKey, "sending");
  chrome.runtime.sendMessage?.({
    type: "MIRRORCHAT_STATUS",
    text: `${cfg?.name || aiKey} の回答を取得中です...`
  });

  // 対象タブとウィンドウにフォーカスを当てる（クリップボードAPI等へのフォーカス対策）
  try {
    // まずウィンドウを前面に出してからタブをアクティブ化する
    const tab = await new Promise((r) =>
      chrome.tabs.get(tabId, (t) => {
        void chrome.runtime.lastError;
        r(t);
      })
    );
    if (tab && tab.windowId) {
      await new Promise((r) =>
        chrome.windows.update(tab.windowId, { focused: true }, () => {
          void chrome.runtime.lastError;
          r();
        })
      );
    }
    await new Promise((r) =>
      chrome.tabs.update(tabId, { active: true }, () => {
        void chrome.runtime.lastError;
        r();
      })
    );
    // フォーカスが当たるまで少し待機
    await new Promise((resolve) => setTimeout(resolve, FOCUS_DELAY_MS));
  } catch (e) {
    console.warn("MirrorChat: focus tab failed", e);
  }

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
          { type: "MIRRORCHAT_FETCH_ONLY", prompt, config: cfg },
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
    // 回答取得フェーズでは、クリップボード利用の都合上タブを順番にフォーカスして処理する
    results = [];
    for (const aiKey of AI_KEYS) {
      const cfg = settings.aiConfigs?.[aiKey];
      if (!aiTabIds[aiKey]) {
        results.push({
          ai: aiKey,
          name: cfg?.name || aiKey,
          markdown: "",
          error: "タブが開いていません"
        });
        notifyAIStatus(aiKey, "error");
        continue;
      }
      // 1サイトずつフォーカスしてクリップボードからテキストを取得する
      // （並列化するとフォーカスとクリップボードが競合するため）
      const r = await processOneTask(aiKey, task.prompt, settings);
      results.push(r);
    }
  }

  const hasAnyMarkdown = results.some((r) => r.markdown && r.markdown.trim().length > 0);
  const failed = results.filter((r) => r.error).map((r) => r.name);
  let saveResult = { ok: false };

  if (hasAnyMarkdown) {
    saveResult = await saveToObsidian(task.prompt, results, settings);
  }

  if (!saveResult.ok) {
    if (hasAnyMarkdown) {
      await appendFailedItemToLocal({
        question: task.prompt,
        results,
        error: saveResult.error
      });
      showNotification("MirrorChat: 一部失敗", `Obsidian保存失敗。失敗: ${failed.join(", ")}。再送可能です。`);
    } else {
      showNotification("MirrorChat: 取得失敗", `全てのAIから回答を取得できませんでした。Obsidianには保存しませんでした。`);
    }
  } else {
    if (failed.length > 0) {
      showNotification("MirrorChat: 一部失敗", `取得失敗: ${failed.join(", ")}。Obsidianには保存済みです。`);
    } else {
      const aiCount = AI_KEYS.length;
      showNotification("MirrorChat: 完了", `${aiCount}つのAIから回答を取得し、Obsidianに保存しました。`);
    }
  }

  // ステータスメッセージを完了状態に更新（最後の「Grok の回答を取得中です...」を上書き）
  chrome.runtime.sendMessage?.({
    type: "MIRRORCHAT_STATUS",
    text: "回答の取得と Obsidian への保存が完了しました。"
  });

  // 可能であれば MirrorChat のタブにフォーカスを戻す
  try {
    await focusMirrorChatTab();
  } catch (e) {
    console.warn("MirrorChat: MirrorChatタブへのフォーカス復帰に失敗しました:", e);
  }

  // 質問フローが完了したので現在のタスク情報をクリアする
  try {
    await new Promise((resolve) => chrome.storage.local.remove(CURRENT_TASK_KEY, resolve));
  } catch (e) {
    console.warn("MirrorChat: CURRENT_TASK_KEY の削除に失敗しました:", e);
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

const OFFSCREEN_DOCUMENT_PATH = "offscreen.html";
let offscreenCreating = null;

async function ensureOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)]
  });
  if (existingContexts.length > 0) return;

  if (offscreenCreating) {
    await offscreenCreating;
    return;
  }
  offscreenCreating = chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: ["CLIPBOARD"],
    justification: "AI応答テキストをクリップボードから取得するため"
  });
  await offscreenCreating;
  offscreenCreating = null;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "MIRRORCHAT_READ_CLIPBOARD") {
    ensureOffscreenDocument()
      .then(() => {
        chrome.runtime.sendMessage(
          { type: "MIRRORCHAT_READ_CLIPBOARD_INTERNAL" },
          (response) => {
            if (chrome.runtime.lastError) {
              sendResponse({ ok: false, error: chrome.runtime.lastError.message });
              return;
            }
            if (response?.ok) {
              sendResponse({ ok: true, text: response.text ?? "" });
            } else {
              sendResponse({ ok: false, error: response?.error ?? "Unknown" });
            }
          }
        );
      })
      .catch((e) => {
        sendResponse({ ok: false, error: e?.message ?? String(e) });
      });
    return true;
  }

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
      if (!aiTabIds[key]) return Promise.resolve();
      return new Promise((resolve) => {
        chrome.tabs.get(aiTabIds[key], (tab) => {
          if (chrome.runtime.lastError || !tab) {
            delete aiTabIds[key];
          } else {
            validTabs[key] = aiTabIds[key];
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
    // 送信フェーズ: 各AIタブにプロンプトを設定して送信のみ行う（回答の取得は後続の FETCH フェーズ）
    (async () => {
      try {
        const prompt = msg.prompt;
        // 現在の質問をローカルストレージに保持（ポップアップ再表示時などに利用）
        await new Promise((resolve) =>
          chrome.storage.local.set(
            { [CURRENT_TASK_KEY]: { prompt, createdAt: Date.now() } },
            resolve
          )
        );

        const settings = await self.MirrorChatStorage.getSettings();
        const sendPromises = AI_KEYS.map((aiKey) => {
          if (!aiTabIds[aiKey]) {
            const cfg = settings.aiConfigs?.[aiKey];
            notifyAIStatus(aiKey, "error");
            return Promise.resolve({
              ai: aiKey,
              name: cfg?.name || aiKey,
              ok: false,
              error: "タブが開いていません"
            });
          }
          // 送信は並列で実行（フォーカス不要）
          return sendPromptToAI(aiKey, prompt, settings);
        });
        await Promise.all(sendPromises);

        chrome.runtime.sendMessage?.({
          type: "MIRRORCHAT_STATUS",
          text: "送信が完了しました。各AIの回答が出揃ったら「回答を取得」を押してください。"
        });
        sendResponse({ ok: true });
      } catch (e) {
        console.error("MirrorChat send error:", e);
        sendResponse({ ok: false, error: e?.message || String(e) });
      }
    })();
    return true;
  } else if (msg.type === "MIRRORCHAT_FETCH") {
    // 回答取得フェーズ: 現在の質問に対してタブを順番にフォーカスし、回答を収集してObsidianに保存
    chrome.storage.local.get(CURRENT_TASK_KEY, (data) => {
      const current = data?.[CURRENT_TASK_KEY];
      if (!current || !current.prompt) {
        sendResponse({ ok: false, error: "取得対象の質問が見つかりませんでした" });
        return;
      }
      queue.push({ prompt: current.prompt });
      if (!processing) processNext();
      sendResponse({ ok: true });
    });
    return true;
  } else if (msg.type === "MIRRORCHAT_RETRY") {
    chrome.storage.local.get(FAILED_ITEMS_KEY, (x) => {
      const items = x[FAILED_ITEMS_KEY] || [];
      chrome.storage.local.set({ [FAILED_ITEMS_KEY]: [] });
      items.forEach((it) => queue.push({ prompt: it.question, retryPayload: it }));
      if (!processing && queue.length > 0) processNext();
      sendResponse({ ok: true });
    });
    return true;
  }
  return false;
});
