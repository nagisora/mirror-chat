(function () {
  const STORAGE_KEY = "mirrorchatSettings";

  const defaultSettings = {
    obsidian: {
      baseUrl: "http://127.0.0.1:27123/",
      token: "",
      rootPath: "200-AI Research"
    },
    aiConfigs: {
      chatgpt: {
        name: "ChatGPT",
        url: "https://chatgpt.com/",
        inputSelector: "div#prompt-textarea, div.ProseMirror[contenteditable='true']",
        submitButtonSelector: "button#composer-submit-button, button[data-testid='send-button']",
        answerContainerSelector: "main div[data-testid='conversation-turns'], main",
        copyButtonSelector: "button[aria-label='Copy'], [data-testid*='copy']",
        doneCheckSelector: "button[data-testid='stop-button']"
      },
      claude: {
        name: "Claude",
        url: "https://claude.ai/",
        inputSelector: "div[data-testid='chat-input'], div.tiptap.ProseMirror[contenteditable='true'], .ProseMirror[contenteditable='true']",
        submitButtonSelector: "button[class*='Button_claude'], div.shrink-0 button[aria-label]",
        answerContainerSelector: "[data-testid='conversation-thread'], main",
        copyButtonSelector: "[data-testid='action-bar-copy'], button[aria-label='Copy']",
        doneCheckSelector: ""
      },
      gemini: {
        name: "Gemini",
        url: "https://gemini.google.com/app",
        inputSelector: "rich-textarea div[contenteditable='true'], div[contenteditable='true'], textarea",
        submitButtonSelector: "button.send-button, button[aria-label='Send message'], button[type='submit']",
        answerContainerSelector: "main",
        copyButtonSelector: "button[aria-label='Copy'], [aria-label*='Copy']",
        doneCheckSelector: ""
      },
      grok: {
        name: "Grok",
        url: "https://grok.com/",
        inputSelector: "div[contenteditable='true'], textarea",
        submitButtonSelector: "button[type='submit'], button[aria-label='Send'], form button",
        answerContainerSelector: "main, article",
        copyButtonSelector: "button[aria-label='Copy'], [aria-label*='Copy']",
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

