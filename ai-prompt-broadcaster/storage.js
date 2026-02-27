(function () {
  const STORAGE_KEY = "mirrorchatSettings";

  const defaultSettings = {
    obsidian: {
      baseUrl: "http://127.0.0.1:27123",
      token: "",
      rootPath: "AI-Research"
    },
    aiConfigs: {
      chatgpt: {
        name: "ChatGPT",
        url: "https://chat.openai.com/",
        inputSelector: "textarea[data-id='root']",
        submitButtonSelector: "button[data-testid='send-button'], button[data-testid='send']",
        answerContainerSelector: "main div[data-testid='conversation-turns']",
        doneCheckSelector: "button[data-testid='stop-button']"
      },
      claude: {
        name: "Claude",
        url: "https://claude.ai/",
        inputSelector: "textarea",
        submitButtonSelector: "button[type='submit']",
        answerContainerSelector: "[data-testid='conversation-thread']",
        doneCheckSelector: ""
      },
      gemini: {
        name: "Gemini",
        url: "https://gemini.google.com/app",
        inputSelector: "textarea, div[contenteditable='true']",
        submitButtonSelector: "button[type='submit']",
        answerContainerSelector: "main",
        doneCheckSelector: ""
      },
      grok: {
        name: "Grok",
        url: "https://x.com/i/grok",
        inputSelector: "textarea, div[contenteditable='true']",
        submitButtonSelector: "button[type='submit']",
        answerContainerSelector: "main",
        doneCheckSelector: ""
      }
    }
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

