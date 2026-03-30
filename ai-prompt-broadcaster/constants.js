/**
 * MirrorChat 共通定数
 * popup / background / options から参照する
 */
(function () {
  const AI_KEYS = ["chatgpt", "claude", "gemini", "grok"];

  const STORAGE_KEYS = {
    FAILED_ITEMS: "mirrorchatFailedItems",
    CURRENT_TASK: "mirrorchatCurrentTask",
    ENABLED_AIS: "mirrorchatEnabledAIs",
    SETTINGS: "mirrorchatSettings",
    AI_TAB_IDS: "mirrorchatAiTabIds",
    FOLDER_SEQ: "mirrorchatFolderSeq",
    LAST_SAVED_FOLDER: "mirrorchatLastSavedFolder",
    QUESTION_FILE_SEQ: "mirrorchatQuestionFileSeq"
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

  const MESSAGE_TYPES = {
    OPEN_TABS: "MIRRORCHAT_OPEN_TABS",
    CLOSE_TABS: "MIRRORCHAT_CLOSE_TABS",
    GET_TAB_STATUS: "MIRRORCHAT_GET_TAB_STATUS",
    SEND: "MIRRORCHAT_SEND",
    FETCH: "MIRRORCHAT_FETCH",
    RETRY: "MIRRORCHAT_RETRY",
    STATUS: "MIRRORCHAT_STATUS",
    AI_STATUS: "MIRRORCHAT_AI_STATUS",
    DONE: "MIRRORCHAT_DONE",
    SEND_ONLY: "MIRRORCHAT_SEND_ONLY",
    FETCH_ONLY: "MIRRORCHAT_FETCH_ONLY",
    READ_CLIPBOARD: "MIRRORCHAT_READ_CLIPBOARD",
    READ_CLIPBOARD_INTERNAL: "MIRRORCHAT_READ_CLIPBOARD_INTERNAL"
  };

  const AI_CONFIG_DEFAULTS = {
    chatgpt: {
      name: "ChatGPT",
      url: "https://chatgpt.com/",
      inputSelector: "div#prompt-textarea, div.ProseMirror[contenteditable='true']",
      submitButtonSelector: "button#composer-submit-button, button[data-testid='send-button']",
      answerContainerSelector: "main div[data-testid='conversation-turns'], main",
      copyButtonSelector: "button[aria-label='Copy'], [aria-label*='Copy'], [aria-label*='コピー'], [data-testid*='copy']",
      doneCheckSelector: "button[data-testid='stop-button']",
      submitMethod: "clickSubmitOrEnter",
      inputSuccessFallback: "chatgpt"
    },
    claude: {
      name: "Claude",
      url: "https://claude.ai/",
      inputSelector:
        "div[data-testid='chat-input'], div.tiptap.ProseMirror[contenteditable='true'], .ProseMirror[contenteditable='true']",
      submitButtonSelector:
        "button[aria-label='メッセージを送信'], button[class*='_claude_'][aria-label*='送信'], button[class*='Button_claude'], div.shrink-0.flex.items-center button[aria-label*='送信'], div.shrink-0 button[aria-label*='送信'], button[aria-label*='Send'], button[aria-label*='送信'], [data-testid='send-button'], button[data-testid*='send'], form button[type='submit'], button[type='submit']",
      answerContainerSelector: "[data-testid='conversation-thread'], main, [class*='message']",
      copyButtonSelector:
        "[data-testid='action-bar-copy'], button[aria-label='Copy'], [aria-label*='Copy'], [aria-label*='コピー']",
      doneCheckSelector: "[data-testid='stop-button'], button[aria-label='Stop']",
      submitMethod: "clickSubmitOrEnter"
    },
    gemini: {
      name: "Gemini",
      url: "https://gemini.google.com/app",
      inputSelector:
        "rich-textarea div[contenteditable='true'], div.ql-editor[contenteditable='true'], div[contenteditable='true'], textarea",
      submitButtonSelector:
        "button.send-button, button[aria-label='Send message'], button[aria-label*='Send'], button[aria-label*='送信'], button[mat-icon-button], button[mat-icon-button][aria-label], [aria-label='Send message'], button[type='submit'], [data-testid*='send']",
      answerContainerSelector: "main, [data-model-id]",
      copyButtonSelector:
        "button[aria-label='Copy'], [aria-label*='Copy'], [aria-label*='コピー'], [data-testid*='copy']",
      doneCheckSelector: "button[aria-label='Stop'], mat-icon[data-mat-icon-name='stop_circle']",
      submitMethod: "clickSubmitOrEnter"
    },
    grok: {
      name: "Grok",
      url: "https://grok.com/",
      inputSelector: "div[contenteditable='true'], textarea",
      submitButtonSelector: "button[type='submit'], button[aria-label='Send'], form button",
      answerContainerSelector: "main, article",
      copyButtonSelector:
        "button[aria-label='Copy'], [aria-label*='Copy'], [aria-label*='コピー'], [data-testid*='copy']",
      doneCheckSelector: "button[aria-label='Stop'], button[aria-label='Cancel']",
      submitMethod: "pressEnterToSubmit"
    }
  };

  const CONTENT_SCRIPTS = {
    chatgpt: {
      files: [
        "constants.js",
        "content-dom-utils.js",
        "content-input-utils.js",
        "content-response-utils.js",
        "content-base.js",
        "content-chatgpt.js"
      ]
    },
    claude: {
      files: [
        "constants.js",
        "content-dom-utils.js",
        "content-input-utils.js",
        "content-response-utils.js",
        "content-base.js",
        "content-claude.js"
      ]
    },
    gemini: {
      files: [
        "constants.js",
        "content-dom-utils.js",
        "content-input-utils.js",
        "content-response-utils.js",
        "content-base.js",
        "content-gemini.js"
      ]
    },
    grok: {
      files: [
        "constants.js",
        "content-dom-utils.js",
        "content-input-utils.js",
        "content-response-utils.js",
        "content-base.js",
        "content-grok.js"
      ]
    }
  };

  const target = typeof window !== "undefined" ? window : self;
  target.MirrorChatConstants = {
    AI_KEYS,
    STORAGE_KEYS,
    MESSAGE_TYPES,
    TIMEOUT_MS,
    HUMAN_DELAY_MS,
    AI_CONFIG_DEFAULTS,
    CONTENT_SCRIPTS
  };
})();
