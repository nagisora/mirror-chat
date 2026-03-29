/**
 * 回答取得・クリップボード系ユーティリティ
 * 同一タブへ複数回 inject される前提のため var を使用する
 */
var COPY_TIMEOUT_MS = COPY_TIMEOUT_MS || 5500;
var CLIPBOARD_READ_ATTEMPTS_MS = CLIPBOARD_READ_ATTEMPTS_MS || [400, 900, 1600, 2500, 4000];
var MIRRORCHAT_MESSAGE_TYPES = MIRRORCHAT_MESSAGE_TYPES || (window.MirrorChatConstants?.MESSAGE_TYPES || {});
var MIRRORCHAT_MSG_READ_CLIPBOARD = MIRRORCHAT_MSG_READ_CLIPBOARD ||
  MIRRORCHAT_MESSAGE_TYPES.READ_CLIPBOARD ||
  "MIRRORCHAT_READ_CLIPBOARD";
var GLOBAL_COPY_BUTTON_FALLBACKS = GLOBAL_COPY_BUTTON_FALLBACKS || [
  "button[aria-label='Copy']",
  "[aria-label*='Copy']",
  "[aria-label*='コピー']",
  "[data-testid*='copy']",
  "[data-testid='action-bar-copy']",
  "button[title*='Copy']",
  "button[title*='コピー']",
  "[data-testid='copy-button']",
  "button[aria-label='Copy code']",
  "[role='button'][aria-label*='Copy']"
];

(function () {
  async function copyResponseViaClipboard(copyButtonSelector) {
    const selectors = (copyButtonSelector || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const allSelectors = [...selectors, ...GLOBAL_COPY_BUTTON_FALLBACKS];

    let copyBtn = null;
    for (const sel of allSelectors) {
      try {
        const btns = document.querySelectorAll(sel);
        if (btns.length > 0) {
          copyBtn = btns[btns.length - 1];
          break;
        }
      } catch {
        /* セレクタが不正な場合は無視 */
      }
    }

    if (!copyBtn) {
      throw new Error("コピーボタンが見つかりません: " + (copyButtonSelector || "(フォールバック含む)"));
    }

    copyBtn.scrollIntoView({ block: "center" });
    await new Promise((r) => setTimeout(r, 300));

    return new Promise((resolve, reject) => {
      let timeoutId;
      const attemptTimeoutIds = [];
      let originalWriteText = null;
      let resolved = false;

      const cleanup = () => {
        clearTimeout(timeoutId);
        attemptTimeoutIds.forEach((id) => clearTimeout(id));
        if (originalWriteText && navigator.clipboard) {
          try {
            Object.defineProperty(navigator.clipboard, "writeText", {
              value: originalWriteText,
              writable: true,
              configurable: true,
            });
          } catch {
            navigator.clipboard.writeText = originalWriteText;
          }
        }
        document.removeEventListener("copy", copyListener, true);
      };

      const finish = (text) => {
        if (resolved) return;
        resolved = true;
        cleanup();
        resolve(text);
      };

      const copyListener = (e) => {
        const text = e.clipboardData?.getData("text/plain");
        if (text) {
          finish(text);
        }
      };
      document.addEventListener("copy", copyListener, true);

      if (navigator.clipboard && navigator.clipboard.writeText) {
        originalWriteText = navigator.clipboard.writeText.bind(navigator.clipboard);
        const interceptor = function (text) {
          finish(text);
          return originalWriteText(text).catch(() => {});
        };
        try {
          Object.defineProperty(navigator.clipboard, "writeText", {
            value: interceptor,
            writable: true,
            configurable: true,
          });
        } catch {
          navigator.clipboard.writeText = interceptor;
        }
      }

      try {
        copyBtn.click();
      } catch (e) {
        cleanup();
        reject(e);
        return;
      }

      const readOffscreenClipboard = () =>
        new Promise((r) => {
          chrome.runtime.sendMessage({ type: MIRRORCHAT_MSG_READ_CLIPBOARD }, (response) => {
            if (chrome.runtime.lastError) {
              r({ ok: false, error: chrome.runtime.lastError.message });
            } else {
              r(response || { ok: false });
            }
          });
        });

      const tryOffscreenRead = async () => {
        if (resolved) return;
        try {
          const resp = await readOffscreenClipboard();
          if (resp?.ok && resp.text && resp.text.length > 0) {
            finish(resp.text);
          }
        } catch {
          /* 読み取り失敗 */
        }
      };

      CLIPBOARD_READ_ATTEMPTS_MS.forEach((ms) => {
        attemptTimeoutIds.push(setTimeout(() => tryOffscreenRead(), ms));
      });

      timeoutId = setTimeout(async () => {
        if (resolved) return;
        await tryOffscreenRead();
        if (resolved) return;
        cleanup();
        reject(new Error("コピータイムアウト: テキストを取得できませんでした"));
      }, COPY_TIMEOUT_MS);
    });
  }

  function extractLatestResponseFromDOM(answerContainerSelector) {
    const selectors = (answerContainerSelector || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    for (const sel of selectors) {
      try {
        const container = document.querySelector(sel);
        if (!container) continue;

        const messageSelectors = [
          "[data-message-author-role='assistant']",
          "div.font-claude-message",
          "[data-testid='chat-message-content']",
          "[data-testid='message-content']",
          "[data-testid='conversation-turn']",
          "message-content",
          "model-response",
          "[data-model-id]",
          ".markdown",
          ".prose",
          "article",
          "[class*='message']",
          "[class*='response']",
          "[class*='assistant']",
        ];

        for (const msgSel of messageSelectors) {
          const msgs = container.querySelectorAll(msgSel);
          if (msgs.length > 0) {
            const lastMsg = msgs[msgs.length - 1];
            return window.MirrorChatUtils?.htmlToMarkdown
              ? window.MirrorChatUtils.htmlToMarkdown(lastMsg)
              : lastMsg.innerText || "";
          }
        }

        return window.MirrorChatUtils?.htmlToMarkdown
          ? window.MirrorChatUtils.htmlToMarkdown(container)
          : container.innerText || "";
      } catch {
        continue;
      }
    }
    return "";
  }

  async function getResponseText(copyButtonSelector, answerContainerSelector) {
    if (copyButtonSelector) {
      try {
        const text = await copyResponseViaClipboard(copyButtonSelector);
        if (text && text.trim().length > 0) {
          return text;
        }
      } catch (e) {
        console.warn("MirrorChat: コピーボタン経由の取得に失敗、DOMフォールバックを使用:", e.message);
      }
    }

    const domText = extractLatestResponseFromDOM(answerContainerSelector);
    if (domText && domText.trim().length > 0) {
      return domText;
    }

    const selectors = (answerContainerSelector || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const sel of selectors) {
      try {
        const container = document.querySelector(sel);
        if (container && container.innerText.trim().length > 0) {
          return container.innerText.trim();
        }
      } catch {
        continue;
      }
    }

    try {
      const root =
        document.querySelector("main") ||
        document.querySelector("[role='main']") ||
        document.body;
      if (root) {
        const pageText = window.MirrorChatUtils?.htmlToMarkdown
          ? window.MirrorChatUtils.htmlToMarkdown(root)
          : root.innerText || "";
        if (pageText && pageText.trim().length > 0) {
          return pageText;
        }
      }
    } catch {
      /* 最終フォールバック失敗時は空文字を返す */
    }

    return "";
  }

  async function fetchResponseTextWithWait(
    copyButtonSelector,
    answerContainerSelector,
    doneCheckSelector,
    maxWaitMs = 15000,
    stableMs = 1500
  ) {
    if (window.MirrorChatUtils?.waitForResponseComplete) {
      await window.MirrorChatUtils.waitForResponseComplete(
        answerContainerSelector,
        doneCheckSelector,
        maxWaitMs,
        stableMs
      );
    }
    return getResponseText(copyButtonSelector, answerContainerSelector);
  }

  window.MirrorChatUtils = window.MirrorChatUtils || {};
  window.MirrorChatUtils.copyResponseViaClipboard = copyResponseViaClipboard;
  window.MirrorChatUtils.extractLatestResponseFromDOM = extractLatestResponseFromDOM;
  window.MirrorChatUtils.getResponseText = getResponseText;
  window.MirrorChatUtils.fetchResponseTextWithWait = fetchResponseTextWithWait;
})();
