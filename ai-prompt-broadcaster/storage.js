(function () {
  const constants = (typeof self !== "undefined" ? self : window).MirrorChatConstants || {};
  const STORAGE_KEY =
    constants.STORAGE_KEYS?.SETTINGS ?? "mirrorchatSettings";

  function cloneAiConfigs(aiConfigs) {
    return Object.fromEntries(
      Object.entries(aiConfigs || {}).map(([key, value]) => [key, { ...value }])
    );
  }

  const defaultSettings = {
    obsidian: {
      baseUrl: "http://127.0.0.1:27123/",
      token: "",
      rootPath: "200-AI Research"
    },
    aiConfigs: cloneAiConfigs(constants.AI_CONFIG_DEFAULTS)
  };

  async function getSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(STORAGE_KEY, (items) => {
        const stored = items[STORAGE_KEY] || {};
        const merged = mergeDeep(defaultSettings, stored);
        resolve(merged);
      });
    });
  }

  async function saveSettings(partial) {
    const current = await getSettings();
    const next = mergeDeep(current, partial);
    return new Promise((resolve) => {
      chrome.storage.sync.set({ [STORAGE_KEY]: next }, () => resolve(next));
    });
  }

  function mergeDeep(target, source) {
    if (typeof source !== "object" || source === null) return target;
    const result = Array.isArray(target) ? [...target] : { ...target };
    Object.keys(source).forEach((key) => {
      const srcVal = source[key];
      if (srcVal && typeof srcVal === "object" && !Array.isArray(srcVal)) {
        result[key] = mergeDeep(result[key] || {}, srcVal);
      } else {
        result[key] = srcVal;
      }
    });
    return result;
  }

  // グローバル公開（popup/options/background から利用）
  if (typeof window !== "undefined") {
    window.MirrorChatStorage = {
      getSettings,
      saveSettings,
      defaultSettings
    };
  } else if (typeof self !== "undefined") {
    // service worker / worker 環境
    self.MirrorChatStorage = {
      getSettings,
      saveSettings,
      defaultSettings
    };
  }
})();

