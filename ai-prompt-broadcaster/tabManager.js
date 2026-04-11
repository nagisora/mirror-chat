(function () {
  const { AI_KEYS, AI_DEFAULT_ORDER, STORAGE_KEYS } = self.MirrorChatConstants;
  const AI_TAB_IDS_KEY = STORAGE_KEYS.AI_TAB_IDS;
  const aiOrderUtils = self.MirrorChatAIOrderUtils;

  const aiTabIds = {};
  let statusNotifier = () => {};

  async function saveAiTabIds() {
    await new Promise((resolve) =>
      chrome.storage.local.set({ [AI_TAB_IDS_KEY]: { ...aiTabIds } }, resolve)
    );
  }

  async function loadAiTabIds() {
    if (Object.keys(aiTabIds).length > 0) return { ...aiTabIds };
    const stored = await new Promise((resolve) =>
      chrome.storage.local.get(AI_TAB_IDS_KEY, (x) => resolve(x[AI_TAB_IDS_KEY] || {}))
    );
    for (const key of AI_KEYS) {
      if (stored[key]) {
        try {
          await new Promise((res, rej) =>
            chrome.tabs.get(stored[key], (tab) => (chrome.runtime.lastError || !tab ? rej() : res(tab)))
          );
          aiTabIds[key] = stored[key];
        } catch {
          delete stored[key];
        }
      }
    }
    await saveAiTabIds();
    return { ...aiTabIds };
  }

  function setStatusNotifier(nextNotifier) {
    statusNotifier = typeof nextNotifier === "function" ? nextNotifier : () => {};
  }

  function getTabId(aiKey) {
    return aiTabIds[aiKey] || null;
  }

  function resolveTargetAIs(rawEnabledAIs) {
    return aiOrderUtils.resolveEnabledAIs(rawEnabledAIs, AI_DEFAULT_ORDER);
  }

  async function openAITabs(settings, enabledAIs) {
    await loadAiTabIds();
    const targetAIs = resolveTargetAIs(enabledAIs);
    for (const aiKey of targetAIs) {
      const cfg = settings.aiConfigs?.[aiKey];
      const url = cfg?.url || "";
      if (!url) continue;

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
          continue;
        } catch {
          delete aiTabIds[aiKey];
        }
      }

      const tab = await new Promise((resolve) => {
        chrome.tabs.create({ url, active: false }, (createdTab) => {
          if (chrome.runtime.lastError) {
            resolve(null);
          } else {
            resolve(createdTab);
          }
        });
      });

      if (tab) {
        aiTabIds[aiKey] = tab.id;
        statusNotifier(aiKey, "open");
      }
    }
    await saveAiTabIds();
    return { ...aiTabIds };
  }

  function closeAITabs(enabledAIs) {
    const targetAIs = resolveTargetAIs(enabledAIs);
    for (const aiKey of targetAIs) {
      if (aiTabIds[aiKey]) {
        chrome.tabs.remove(aiTabIds[aiKey], () => {
          void chrome.runtime.lastError;
        });
        delete aiTabIds[aiKey];
        statusNotifier(aiKey, "");
      }
    }
    void saveAiTabIds();
  }

  async function getValidOpenTabs() {
    await loadAiTabIds();
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
    await Promise.all(checks);
    await saveAiTabIds();
    return validTabs;
  }

  async function focusExtensionPopupTab() {
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
      } catch {
        resolve();
      }
    });
  }

  chrome.tabs.onRemoved.addListener((tabId) => {
    for (const key of AI_KEYS) {
      if (aiTabIds[key] === tabId) {
        delete aiTabIds[key];
        statusNotifier(key, "");
        void saveAiTabIds();
        break;
      }
    }
  });

  self.MirrorChatTabManager = {
    setStatusNotifier,
    getTabId,
    loadAiTabIds,
    openAITabs,
    closeAITabs,
    getValidOpenTabs,
    focusExtensionPopupTab
  };
})();