(function () {
  const { TIMEOUT_MS, CONTENT_SCRIPTS, MESSAGE_TYPES } = self.MirrorChatConstants;
  const TASK_TIMEOUT_MS = TIMEOUT_MS.TASK;
  const FOCUS_DELAY_MS = TIMEOUT_MS.FOCUS_DELAY;

  function notifyAIStatus(ai, state) {
    chrome.runtime.sendMessage?.({ type: MESSAGE_TYPES.AI_STATUS, ai, state });
  }

  function sendStatusText(text) {
    chrome.runtime.sendMessage?.({ type: MESSAGE_TYPES.STATUS, text });
  }

  async function focusAiTab(tabId) {
    try {
      const tab = await new Promise((resolve) =>
        chrome.tabs.get(tabId, (t) => {
          void chrome.runtime.lastError;
          resolve(t);
        })
      );
      if (tab && tab.windowId) {
        await new Promise((resolve) =>
          chrome.windows.update(tab.windowId, { focused: true }, () => {
            void chrome.runtime.lastError;
            resolve();
          })
        );
      }
      await new Promise((resolve) =>
        chrome.tabs.update(tabId, { active: true }, () => {
          void chrome.runtime.lastError;
          resolve();
        })
      );
      await new Promise((resolve) => setTimeout(resolve, FOCUS_DELAY_MS));
    } catch (e) {
      console.warn("MirrorChat: focus tab failed", e);
    }
  }

  async function sendPromptToAI(aiKey, prompt, settings) {
    const tabManager = self.MirrorChatTabManager;
    const cfg = settings.aiConfigs?.[aiKey];
    const tabId = tabManager.getTabId(aiKey);

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
            { type: MESSAGE_TYPES.SEND_ONLY, prompt, config: cfg },
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
    const tabManager = self.MirrorChatTabManager;
    const cfg = settings.aiConfigs?.[aiKey];
    const tabId = tabManager.getTabId(aiKey);

    if (!tabId) {
      return { ai: aiKey, name: cfg?.name || aiKey, markdown: "", error: "タブが開いていません" };
    }

    notifyAIStatus(aiKey, "sending");
    sendStatusText(`${cfg?.name || aiKey} の回答を取得中です...`);
    await focusAiTab(tabId);

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
            { type: MESSAGE_TYPES.FETCH_ONLY, prompt, config: cfg },
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

  self.MirrorChatAICommunication = {
    notifyAIStatus,
    sendStatusText,
    sendPromptToAI,
    processOneTask
  };
})();