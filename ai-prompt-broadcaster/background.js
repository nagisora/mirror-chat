importScripts(
  "constants.js",
  "storage.js",
  "obsidianClient.js",
  "openRouterFreeModels.js",
  "openRouterClient.js",
  "digestService.js",
  "taskQueue.js",
  "errorRetry.js",
  "obsidianStorage.js",
  "tabManager.js",
  "aiCommunication.js"
);

const { AI_KEYS, STORAGE_KEYS, MESSAGE_TYPES } = self.MirrorChatConstants;
const CURRENT_TASK_KEY = STORAGE_KEYS.CURRENT_TASK;
const LAST_SAVED_FOLDER_KEY = STORAGE_KEYS.LAST_SAVED_FOLDER;
const LAST_NOTE_SNAPSHOT_KEY = STORAGE_KEYS.LAST_NOTE_SNAPSHOT;

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

const taskQueue = self.MirrorChatTaskQueue;
const retryStore = self.MirrorChatRetryStore;
const obsidianStorage = self.MirrorChatObsidianStorage;
const tabManager = self.MirrorChatTabManager;
const aiCommunication = self.MirrorChatAICommunication;
const digestService = self.MirrorChatDigestService;

function sendDigestStatus(text, options = {}) {
  chrome.runtime.sendMessage?.({
    type: MESSAGE_TYPES.DIGEST_STATUS,
    text,
    errorText: options.errorText || "",
    tone: options.tone || "info"
  });
}

async function readLastNoteSnapshot() {
  return new Promise((resolve) => {
    chrome.storage.local.get(LAST_NOTE_SNAPSHOT_KEY, (data) => {
      resolve(data?.[LAST_NOTE_SNAPSHOT_KEY] || null);
    });
  });
}

async function writeLastNoteSnapshot(snapshot) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [LAST_NOTE_SNAPSHOT_KEY]: snapshot }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

async function runDigestFollowUp({ question, results, settings, notePath }) {
  sendDigestStatus("digest を生成しています...", { tone: "info" });

  const digestResult = await digestService.generateDigest({
    question,
    results,
    settings,
    fetchImpl: fetch,
    onProgress: async (progress) => {
      if (!progress) return;
      if (progress.stage === "catalog-start") {
        sendDigestStatus(progress.message || "digest の free候補を確認しています...", {
          tone: "info",
          errorText: ""
        });
        return;
      }
      if (progress.stage === "catalog-failure") {
        sendDigestStatus(
          progress.message || "free候補の取得に失敗したため、保存済み候補で digest を続行します。",
          {
            tone: "error",
            errorText: progress.errorMessage || progress.error || "不明なエラー"
          }
        );
        return;
      }
      if (progress.stage === "attempt-start") {
        sendDigestStatus(progress.message || "digest を生成しています...", {
          tone: "info",
          errorText: progress.errorMessage || ""
        });
        return;
      }
      if (progress.stage === "attempt-failure") {
        sendDigestStatus(progress.message || "digest を生成しています...", {
          tone: "error",
          errorText: progress.errorMessage || progress.error || "不明なエラー"
        });
      }
    }
  });

  if (Array.isArray(digestResult.refreshedCandidates) && digestResult.refreshedCandidates.length > 0) {
    try {
      await self.MirrorChatStorage.saveSettings({
        openrouter: {
          freeModelCandidatesOverride: digestResult.refreshedCandidates,
          lastRefreshAt: new Date().toISOString()
        }
      });
    } catch (error) {
      console.warn("MirrorChat: free候補の保存に失敗しました:", error);
    }
  }

  if (!digestResult.ok) {
    const failureText = digestService.buildDigestFailureText(digestResult.error);
    const updateFailure = await obsidianStorage.updateDigestInObsidian(notePath, failureText, settings);
    if (!updateFailure.ok) {
      sendDigestStatus("digest の生成と書き戻しに失敗しました。", {
        tone: "error",
        errorText: updateFailure.error || digestResult.error || "不明なエラー"
      });
      console.error("MirrorChat digest update error:", updateFailure.error);
      return;
    }
    sendDigestStatus("digest の生成に失敗しました。ファイルに失敗状態を反映しました。", {
      tone: "error",
      errorText: digestResult.error || "不明なエラー"
    });
    return;
  }

  const updateResult = await obsidianStorage.updateDigestInObsidian(notePath, digestResult.digest, settings);
  if (!updateResult.ok) {
    sendDigestStatus("digest の生成には成功しましたが、Obsidian への反映に失敗しました。", {
      tone: "error",
      errorText: updateResult.error || "不明なエラー"
    });
    console.error("MirrorChat digest save error:", updateResult.error);
    return;
  }

  sendDigestStatus(`digest を反映しました。使用モデル: ${digestResult.modelId}`, { tone: "success" });
}

function resolveEnabledAIs(rawEnabledAIs) {
  if (typeof rawEnabledAIs === "undefined") return [...AI_KEYS];
  if (!Array.isArray(rawEnabledAIs)) return [];
  return AI_KEYS.filter((key) => rawEnabledAIs.includes(key));
}

tabManager.setStatusNotifier(aiCommunication.notifyAIStatus);

async function runTask(task) {
  const settings = await self.MirrorChatStorage.getSettings();
  const enabledAIs = resolveEnabledAIs(task.enabledAIs);
  let results;

  if (task.retryPayload?.results) {
    results = task.retryPayload.results;
  } else {
    // 回答取得フェーズでは、クリップボード利用の都合上タブを順番にフォーカスして処理する
    results = [];
    for (const aiKey of enabledAIs) {
      const cfg = settings.aiConfigs?.[aiKey];
      if (!tabManager.getTabId(aiKey)) {
        results.push({
          ai: aiKey,
          name: cfg?.name || aiKey,
          markdown: "",
          error: "タブが開いていません"
        });
        aiCommunication.notifyAIStatus(aiKey, "error");
        continue;
      }
      // 1サイトずつフォーカスしてクリップボードからテキストを取得する
      // （並列化するとフォーカスとクリップボードが競合するため）
      const r = await aiCommunication.processOneTask(aiKey, task.prompt, settings);
      results.push(r);
    }
  }

  const hasAnyMarkdown = results.some((r) => r.markdown && r.markdown.trim().length > 0);
  const failed = results.filter((r) => r.error).map((r) => r.name);
  let saveResult = { ok: false };

  if (hasAnyMarkdown) {
    if (task.isFollowUp) {
      const basePath = task.basePath || (await new Promise((resolve) =>
        chrome.storage.local.get(LAST_SAVED_FOLDER_KEY, (x) => resolve(x[LAST_SAVED_FOLDER_KEY]))
      ));
      if (!basePath) {
        saveResult = { ok: false, error: "続きの質問に対応する保存先フォルダが見つかりません。先に新規質問を送信・保存してください。" };
      } else {
        saveResult = await obsidianStorage.appendToObsidian(basePath, task.prompt, results, settings);
      }
    } else {
      saveResult = await obsidianStorage.saveToObsidian(task.prompt, results, settings);
    }
  }

  if (!saveResult.ok) {
    if (hasAnyMarkdown) {
      const failedPayload = { question: task.prompt, results, error: saveResult.error };
      // 続きの質問の場合は再試行用に basePath を保持する
      if (task.isFollowUp) {
        failedPayload.isFollowUp = true;
        failedPayload.basePath =
          task.basePath ||
          (await new Promise((resolve) =>
            chrome.storage.local.get(LAST_SAVED_FOLDER_KEY, (x) => resolve(x[LAST_SAVED_FOLDER_KEY]))
          ));
      }
      await retryStore.appendFailedItemToLocal(failedPayload);
      showNotification("MirrorChat: 一部失敗", `Obsidian保存失敗。失敗: ${failed.join(", ")}。再送可能です。`);
    } else {
      showNotification("MirrorChat: 取得失敗", `全てのAIから回答を取得できませんでした。Obsidianには保存しませんでした。`);
    }
  } else {
    if (failed.length > 0) {
      showNotification("MirrorChat: 一部失敗", `取得失敗: ${failed.join(", ")}。Obsidianには保存済みです。`);
    } else {
      const aiCount = results.length;
      showNotification("MirrorChat: 完了", `${aiCount}つのAIから回答を取得し、Obsidianに保存しました。`);
    }
  }

  const saveFailed = !saveResult.ok && hasAnyMarkdown;

  // ステータスメッセージを完了状態に更新（最後の「Grok の回答を取得中です...」を上書き）
  aiCommunication.sendStatusText(
    saveFailed
      ? "Obsidian への保存に失敗しました。もう一度「回答を取得」を押して再試行してください。"
      : "回答の取得と Obsidian への保存が完了しました。"
  );

  // 可能であれば MirrorChat のタブにフォーカスを戻す
  try {
    await tabManager.focusExtensionPopupTab();
  } catch (e) {
    console.warn("MirrorChat: MirrorChatタブへのフォーカス復帰に失敗しました:", e);
  }

  // 保存成功時のみ質問フローを完了として CURRENT_TASK をクリアする（失敗時は再試行可能にするため残す）
  if (!saveFailed) {
    try {
      await new Promise((resolve) => chrome.storage.local.remove(CURRENT_TASK_KEY, resolve));
    } catch (e) {
      console.warn("MirrorChat: CURRENT_TASK_KEY の削除に失敗しました:", e);
    }
  }

  if (saveResult.ok && saveResult.notePath) {
    try {
      await writeLastNoteSnapshot({
        question: task.prompt,
        results,
        notePath: saveResult.notePath,
        basePath: saveResult.basePath || null,
        fileName: saveResult.fileName || null,
        isFollowUp: !!task.isFollowUp,
        savedAt: Date.now()
      });
    } catch (error) {
      console.warn("MirrorChat: 直近ノート情報の保存に失敗しました:", error);
      aiCommunication.sendStatusText(
        "保存は完了しましたが、直近ノート情報の保存に失敗しました。再保存/digest再生成が使えない場合があります。"
      );
    }
  }

  if (saveResult.ok && digestService.isDigestEnabled(settings) && saveResult.notePath) {
    runDigestFollowUp({
      question: task.prompt,
      results,
      settings,
      notePath: saveResult.notePath
    }).catch((error) => {
      sendDigestStatus("digest の生成に失敗しました。");
      console.error("MirrorChat digest follow-up error:", error);
    });
  }

  chrome.runtime.sendMessage?.({ type: MESSAGE_TYPES.DONE, saveFailed });
  processNext();
}

function processNext() {
  if (taskQueue.isEmpty()) {
    taskQueue.setProcessing(false);
    return;
  }
  taskQueue.setProcessing(true);
  const task = taskQueue.dequeue();
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
  const handlers = {
    [MESSAGE_TYPES.READ_CLIPBOARD]: () => {
      ensureOffscreenDocument()
        .then(() => {
          chrome.runtime.sendMessage(
            { type: MESSAGE_TYPES.READ_CLIPBOARD_INTERNAL },
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
    },

    [MESSAGE_TYPES.OPEN_TABS]: () => {
      self.MirrorChatStorage.getSettings()
        .then((settings) => tabManager.openAITabs(settings, msg.enabledAIs))
        .then((tabs) => {
          sendResponse({ ok: true, openTabs: tabs });
        })
        .catch((e) => {
          console.error("MirrorChat openAITabs error:", e);
          sendResponse({ ok: false, error: e?.message || String(e) });
        });
      return true;
    },

    [MESSAGE_TYPES.CLOSE_TABS]: () => {
      (async () => {
        tabManager.closeAITabs(msg.enabledAIs);
        const validTabs = await tabManager.getValidOpenTabs();
        sendResponse({ ok: true, openTabs: validTabs });
      })();
      return true;
    },

    [MESSAGE_TYPES.GET_TAB_STATUS]: () => {
      (async () => {
        const validTabs = await tabManager.getValidOpenTabs();
        sendResponse({ openTabs: validTabs });
      })();
      return true;
    },

    [MESSAGE_TYPES.SEND]: () => {
      // 送信フェーズ: 各AIタブにプロンプトを設定して送信のみ行う（回答の取得は後続の FETCH フェーズ）
      (async () => {
        try {
          await tabManager.loadAiTabIds();
          const prompt = msg.prompt;
          const enabledAIs = resolveEnabledAIs(msg.enabledAIs);
          if (enabledAIs.length === 0) {
            sendResponse({ ok: false, error: "使用する AI を1つ以上選択してください。" });
            return;
          }
          // 現在の質問をローカルストレージに保持（ポップアップ再表示時などに利用）
          const isFollowUp = !!msg.isFollowUp;
          await new Promise((resolve) =>
            chrome.storage.local.set(
              { [CURRENT_TASK_KEY]: { prompt, createdAt: Date.now(), isFollowUp, enabledAIs } },
              resolve
            )
          );

          const settings = await self.MirrorChatStorage.getSettings();
          const sendPromises = enabledAIs.map((aiKey) => {
            if (!tabManager.getTabId(aiKey)) {
              const cfg = settings.aiConfigs?.[aiKey];
              aiCommunication.notifyAIStatus(aiKey, "error");
              return Promise.resolve({
                ai: aiKey,
                name: cfg?.name || aiKey,
                ok: false,
                error: "タブが開いていません"
              });
            }
            // 送信は並列で実行（フォーカス不要）
            return aiCommunication.sendPromptToAI(aiKey, prompt, settings);
          });
          await Promise.all(sendPromises);

          aiCommunication.sendStatusText("送信が完了しました。各AIの回答が出揃ったら「回答を取得」を押してください。");
          sendResponse({ ok: true });
        } catch (e) {
          console.error("MirrorChat send error:", e);
          sendResponse({ ok: false, error: e?.message || String(e) });
        }
      })();
      return true;
    },

    [MESSAGE_TYPES.FETCH]: () => {
      // 回答取得フェーズ: 現在の質問に対してタブを順番にフォーカスし、回答を収集してObsidianに保存
      chrome.storage.local.get(CURRENT_TASK_KEY, async (data) => {
        const current = data?.[CURRENT_TASK_KEY];
        if (!current || !current.prompt) {
          sendResponse({ ok: false, error: "取得対象の質問が見つかりませんでした" });
          return;
        }
        await tabManager.loadAiTabIds();
        taskQueue.enqueue({
          prompt: current.prompt,
          isFollowUp: !!current.isFollowUp,
          enabledAIs: resolveEnabledAIs(current.enabledAIs)
        });
        if (!taskQueue.isProcessing()) processNext();
        sendResponse({ ok: true });
      });
      return true;
    },

    [MESSAGE_TYPES.RETRY]: () => {
      retryStore.drainFailedItems().then((items) => {
        items.forEach((it) => {
          const task = { prompt: it.question, retryPayload: it };
          if (it.isFollowUp) task.isFollowUp = true;
          if (it.basePath) task.basePath = it.basePath;
          taskQueue.enqueue(task);
        });
        if (!taskQueue.isProcessing() && items.length > 0) processNext();
        sendResponse({ ok: true });
      });
      return true;
    },

    [MESSAGE_TYPES.RESAVE_LAST]: () => {
      (async () => {
        const snapshot = await readLastNoteSnapshot();
        if (!snapshot?.notePath || !snapshot?.question || !Array.isArray(snapshot?.results)) {
          sendResponse({ ok: false, error: "再保存できる直近ノートがありません。まず通常の保存を一度実行してください。" });
          return;
        }

        const settings = await self.MirrorChatStorage.getSettings();
        const resaveResult = await obsidianStorage.rewriteNoteInObsidian(
          snapshot.notePath,
          snapshot.question,
          snapshot.results,
          settings
        );
        if (!resaveResult.ok) {
          sendResponse({ ok: false, error: resaveResult.error });
          return;
        }

        aiCommunication.sendStatusText("直近ノートを再保存しました。");

        if (snapshot.notePath) {
          runDigestFollowUp({
            question: snapshot.question,
            results: snapshot.results,
            settings,
            notePath: snapshot.notePath
          }).catch((error) => {
            sendDigestStatus("digest の再生成に失敗しました。", {
              tone: "error",
              errorText: error?.message || String(error)
            });
            console.error("MirrorChat digest follow-up error:", error);
          });
        }

        sendResponse({ ok: true, notePath: snapshot.notePath });
      })().catch((error) => {
        console.error("MirrorChat resave error:", error);
        sendResponse({ ok: false, error: error?.message || String(error) });
      });
      return true;
    },

    [MESSAGE_TYPES.REGENERATE_DIGEST]: () => {
      (async () => {
        const snapshot = await readLastNoteSnapshot();
        if (!snapshot?.notePath || !snapshot?.question || !Array.isArray(snapshot?.results)) {
          sendResponse({ ok: false, error: "digest を再生成できる直近ノートがありません。まず通常の保存を一度実行してください。" });
          return;
        }

        const selectedModel = String(msg.modelId || "").trim();
        const settings = await self.MirrorChatStorage.getSettings();
        const digestSettings = {
          ...settings,
          openrouter: {
            ...(settings.openrouter || {}),
            preferredModel: selectedModel
          }
        };

        runDigestFollowUp({
          question: snapshot.question,
          results: snapshot.results,
          settings: digestSettings,
          notePath: snapshot.notePath
        }).catch((error) => {
          sendDigestStatus("digest の再生成に失敗しました。", {
            tone: "error",
            errorText: error?.message || String(error)
          });
          console.error("MirrorChat digest regeneration error:", error);
        });

        sendResponse({ ok: true, notePath: snapshot.notePath, modelId: selectedModel });
      })().catch((error) => {
        console.error("MirrorChat regenerate digest error:", error);
        sendResponse({ ok: false, error: error?.message || String(error) });
      });
      return true;
    }
  };

  const handler = handlers[msg.type];
  if (!handler) {
    return false;
  }
  return handler(msg, sender, sendResponse);
});
