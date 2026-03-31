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
    openrouter: {
      enableDigest: false,
      apiKey: "",
      preferredModel: "",
      freeModelCandidatesOverride: [],
      lastRefreshAt: ""
    },
    aiConfigs: cloneAiConfigs(constants.AI_CONFIG_DEFAULTS)
  };

  async function getStoredSettingsRaw() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(STORAGE_KEY, (items) => {
        resolve(items[STORAGE_KEY] || {});
      });
    });
  }

  async function getSettings() {
    const stored = await getStoredSettingsRaw();
    return mergeDeep(defaultSettings, stored);
  }

  async function saveSettings(partial) {
    const stored = await getStoredSettingsRaw();
    const nextStored = mergeForStorage(stored, partial);
    const resolved = mergeDeep(defaultSettings, nextStored);
    return new Promise((resolve) => {
      chrome.storage.sync.set({ [STORAGE_KEY]: nextStored }, () => resolve(resolved));
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

  function mergeForStorage(target, source) {
    if (typeof source !== "object" || source === null) return target;
    const result = Array.isArray(target) ? [...target] : { ...(target || {}) };
    Object.keys(source).forEach((key) => {
      const srcVal = source[key];
      if (srcVal === null) {
        delete result[key];
        return;
      }
      if (srcVal && typeof srcVal === "object" && !Array.isArray(srcVal)) {
        const currentChild =
          result[key] && typeof result[key] === "object" && !Array.isArray(result[key])
            ? result[key]
            : {};
        const mergedChild = mergeForStorage(currentChild, srcVal);
        if (Object.keys(mergedChild).length === 0) {
          delete result[key];
        } else {
          result[key] = mergedChild;
        }
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

