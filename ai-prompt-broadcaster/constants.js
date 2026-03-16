/**
 * MirrorChat 共通定数
 * popup / background / options から参照する
 */
(function () {
  const AI_KEYS = ["chatgpt", "claude", "gemini", "grok"];

  const STORAGE_KEYS = {
    FAILED_ITEMS: "mirrorchatFailedItems",
    CURRENT_TASK: "mirrorchatCurrentTask",
    SETTINGS: "mirrorchatSettings",
    AI_TAB_IDS: "mirrorchatAiTabIds",
    FOLDER_SEQ: "mirrorchatFolderSeq",
    LAST_SAVED_FOLDER: "mirrorchatLastSavedFolder"
  };

  const TIMEOUT_MS = {
    TASK: 120000,
    RESPONSE_WAIT: 15000,
    STABLE_WAIT: 1500,
    FOCUS_DELAY: 500,
    COPY: 5500,
    CLIPBOARD_READ_ATTEMPTS: [400, 900, 1600, 2500, 4000]
  };

  const HUMAN_DELAY_MS = {
    MIN: 2000,
    MAX: 3500,
    FALLBACK: 2500
  };

  const CONTENT_SCRIPTS = {
    chatgpt: { files: ["content-utils.js", "content-base.js", "content-chatgpt.js"] },
    claude: { files: ["content-utils.js", "content-base.js", "content-claude.js"] },
    gemini: { files: ["content-utils.js", "content-base.js", "content-gemini.js"] },
    grok: { files: ["content-utils.js", "content-base.js", "content-grok.js"] }
  };

  const target = typeof window !== "undefined" ? window : self;
  target.MirrorChatConstants = {
    AI_KEYS,
    STORAGE_KEYS,
    TIMEOUT_MS,
    HUMAN_DELAY_MS,
    CONTENT_SCRIPTS
  };
})();
