/**
 * DOM からテキスト抽出・Markdown 変換の共通ユーティリティ
 * 各 content script から参照される
 *
 * 参考: pykrete67/prompt-queue-extension の common.js
 *       repmax/ai-chat-downloader の Markdown 変換
 *
 * 注意: 同一タブに SEND_ONLY / FETCH_ONLY で複数回インジェクトされるため、
 *       const だと "already been declared" エラーになる。var を使用する。
 */
var RESPONSE_WAIT_INITIAL_MS = RESPONSE_WAIT_INITIAL_MS || 15000;
var POLL_INTERVAL_MS = POLL_INTERVAL_MS || 500;
var COPY_TIMEOUT_MS = COPY_TIMEOUT_MS || 5500;
var CLIPBOARD_READ_ATTEMPTS_MS = CLIPBOARD_READ_ATTEMPTS_MS || [400, 900, 1600, 2500, 4000];

function htmlToMarkdown(container) {
  if (!container) return "";
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node;
    const tag = el.tagName.toLowerCase();
    const children = Array.from(el.childNodes).map(walk).join("");
    if (tag === "pre") {
      const code = el.querySelector("code");
      const lang = code?.getAttribute("class")?.match(/language-(\w+)/)?.[1] || "";
      return "\n```" + lang + "\n" + (code?.textContent || el.textContent) + "\n```\n";
    }
    if (tag === "code" && el.closest("pre")) return el.textContent || "";
    if (tag === "code") return "`" + (el.textContent || "") + "`";
    if (tag === "strong" || tag === "b") return "**" + children + "**";
    if (tag === "em" || tag === "i") return "*" + children + "*";
    if (tag === "blockquote") return "\n> " + children.trim().replace(/\n/g, "\n> ") + "\n";
    if (tag === "ul") return "\n" + children + "\n";
    if (tag === "ol") return "\n" + children + "\n";
    if (tag === "li") return "- " + children.trim() + "\n";
    if (tag === "p") return "\n" + children.trim() + "\n";
    if (tag === "br") return "\n";
    if (tag === "h1") return "\n# " + children.trim() + "\n";
    if (tag === "h2") return "\n## " + children.trim() + "\n";
    if (tag === "h3") return "\n### " + children.trim() + "\n";
    return children;
  };
  return walk(container).trim().replace(/\n{3,}/g, "\n\n");
}

function waitFor(selector, timeout = 10000) {
  return new Promise((resolve) => {
    const el = document.querySelector(selector);
    if (el) return resolve(el);
    const obs = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        obs.disconnect();
        resolve(el);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => {
      obs.disconnect();
      resolve(document.querySelector(selector));
    }, timeout);
  });
}

function waitForStable(containerSelector, stableMs = 3000) {
  return new Promise((resolve) => {
    let timer;
    const obs = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        obs.disconnect();
        resolve();
      }, stableMs);
    });
    const container = document.querySelector(containerSelector);
    if (!container) {
      resolve();
      return;
    }
    obs.observe(container, { childList: true, subtree: true, characterData: true });
    timer = setTimeout(() => {
      obs.disconnect();
      resolve();
    }, stableMs);
  });
}

/**
 * AIの応答が完了するまで待つ。
 * doneCheckSelector（停止ボタン等）が消えるまで、または maxWaitMs 経過まで待機。
 * その後、DOM が安定するまで追加で待つ。
 *
 * @param {string} answerContainerSelector - 回答コンテナのセレクタ
 * @param {string} doneCheckSelector - 応答中に表示される要素のセレクタ（例: 停止ボタン）。消えたら応答完了とみなす
 * @param {number} maxWaitMs - 最大待機時間（デフォルト90秒）
 * @param {number} stableMs - DOM安定とみなす無変更時間（デフォルト5秒）
 */
async function waitForResponseComplete(answerContainerSelector, doneCheckSelector, maxWaitMs = 90000, stableMs = 5000) {
  const start = Date.now();

  // フェーズ1: まず応答が開始されるのを待つ（コンテナ内に何か出現するまで）
  while (Date.now() - start < RESPONSE_WAIT_INITIAL_MS) {
    const container = document.querySelector(answerContainerSelector);
    if (container && container.children.length > 0) break;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  // フェーズ2: doneCheckSelector がある場合、それが消えるまで待つ
  if (doneCheckSelector) {
    while (Date.now() - start < maxWaitMs) {
      const indicator = document.querySelector(doneCheckSelector);
      if (!indicator) break; // 停止ボタン等が消えた = 応答完了
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  // フェーズ3: DOM が安定するまで追加で待つ
  await waitForStable(answerContainerSelector, stableMs);
}

/**
 * 人間らしいランダム遅延（bot判定回避）
 */
function humanDelay(minMs = 2000, maxMs = 3500) {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * React / ProseMirror / フレームワーク対応のテキスト入力シミュレーション
 *
 * ChatGPT の ProseMirror で実際に動作確認済みの手法:
 *   el.focus() → execCommand('selectAll') → execCommand('insertText', false, text)
 *
 * 重要: execCommand("delete") は ProseMirror の内部状態を壊すため使わない。
 *        selectAll で選択 → insertText で置換するのが正しいパターン。
 */
function simulateInput(element, text) {
  element.focus();

  const isContentEditable =
    element.isContentEditable || element.getAttribute("contenteditable") === "true";

  if (isContentEditable) {
    // ProseMirror / Tiptap / contenteditable 用
    // selectAll → insertText で既存テキストを置換（delete は使わない）
    document.execCommand("selectAll", false);
    document.execCommand("insertText", false, text);

    if (!element.textContent.includes(text)) {
      // フォールバック: ClipboardEvent paste
      const dt = new DataTransfer();
      dt.setData("text/plain", text);
      element.dispatchEvent(new ClipboardEvent("paste", {
        bubbles: true, cancelable: true, clipboardData: dt
      }));
    }

    if (!element.textContent.includes(text)) {
      // 最終フォールバック: 直接設定 + イベント発火
      element.textContent = text;
      const sel = window.getSelection();
      const r = document.createRange();
      r.selectNodeContents(element);
      r.collapse(false);
      sel.removeAllRanges();
      sel.addRange(r);
      element.dispatchEvent(new InputEvent("input", {
        bubbles: true, inputType: "insertText", data: text
      }));
    }
  } else {
    // textarea / input 用
    element.select();

    // native setter（React で最も確実）
    const proto = element.tagName === "TEXTAREA"
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (nativeSetter) {
      nativeSetter.call(element, text);
    } else {
      element.value = text;
    }
    element.dispatchEvent(new InputEvent("input", {
      bubbles: true, inputType: "insertText", data: text
    }));
  }

  element.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * Enter キーで送信する。
 * Claude, Grok など Enter で送信するサービス用。
 */
function pressEnterToSubmit(element) {
  element.focus();
  const opts = {
    key: "Enter", code: "Enter", keyCode: 13, which: 13,
    bubbles: true, cancelable: true
  };
  element.dispatchEvent(new KeyboardEvent("keydown", opts));
  element.dispatchEvent(new KeyboardEvent("keypress", opts));
  element.dispatchEvent(new KeyboardEvent("keyup", opts));
}

/**
 * 送信ボタンが有効になるのを待ってクリック。
 * 人間らしい遅延を入れてから送信する。
 * ボタンが見つからない/無効のままの場合は Enter キーでフォールバック送信。
 */
async function clickSubmitOrEnter(submitSelector, inputElement, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    // セレクタをカンマ区切りで複数試行
    const selectors = submitSelector.split(",").map((s) => s.trim());
    for (const sel of selectors) {
      try {
        const btn = document.querySelector(sel);
        if (btn && !btn.disabled && btn.getAttribute("aria-disabled") !== "true") {
          btn.scrollIntoView({ block: "center" });
          await new Promise((r) => setTimeout(r, 100));
          btn.click();
          return true;
        }
      } catch { /* セレクタが不正な場合は無視 */ }
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  // フォールバック: Enter キーで送信
  if (inputElement) {
    inputElement.focus();
    const enterOpts = {
      key: "Enter", code: "Enter", keyCode: 13, which: 13,
      bubbles: true, cancelable: true
    };
    inputElement.dispatchEvent(new KeyboardEvent("keydown", enterOpts));
    inputElement.dispatchEvent(new KeyboardEvent("keypress", enterOpts));
    inputElement.dispatchEvent(new KeyboardEvent("keyup", enterOpts));
    return true;
  }
  return false;
}

/**
 * コピーボタンをクリックしてクリップボードからAI応答テキストを取得する。
 * 各AIチャットのコピーボタンは最新の応答をコピーするため、DOM抽出より正確。
 *
 * 取得手順:
 * 1. navigator.clipboard.writeText をインターセプトして書き込まれるテキストを横取り
 * 2. copy イベントリスナーで clipboardData を取得
 * 3. タイムアウト後はオフスクリーンドキュメント経由でクリップボード読み取りを試行
 *
 * @param {string} copyButtonSelector - コピーボタンのセレクタ（複数マッチ時は最後の=最新応答のボタンを使用）
 * @returns {Promise<string>} クリップボードから取得したテキスト
 */
// content-utils.js は同じタブに複数回インジェクトされる可能性があるため、
// const ではなく var + 既存値チェックで多重定義エラーを避ける
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
        copyBtn = btns[btns.length - 1]; // 最後の=最新応答のコピーボタン
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

    // 方法1: copy イベントリスナー
    const copyListener = (e) => {
      const text = e.clipboardData?.getData("text/plain");
      if (text) {
        finish(text);
      }
    };
    document.addEventListener("copy", copyListener, true);

    // 方法2: navigator.clipboard.writeText をインターセプト
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

    // 方法3: オフスクリーンドキュメント経由でクリップボード読み取りを複数回試行
    // コピーは非同期で完了する場合があるため、複数タイミングで試行する
    const readOffscreenClipboard = () =>
      new Promise((r) => {
        chrome.runtime.sendMessage({ type: "MIRRORCHAT_READ_CLIPBOARD" }, (response) => {
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

/**
 * 最新のAI応答のテキストを DOM から直接抽出する。
 * コピーボタンが機能しない場合のフォールバック。
 * 各AI向けの answerContainerSelector 内の最後のメッセージブロックを取得する。
 *
 * @param {string} answerContainerSelector - 回答コンテナのセレクタ
 * @returns {string} 抽出したMarkdownテキスト
 */
function extractLatestResponseFromDOM(answerContainerSelector) {
  const selectors = (answerContainerSelector || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const sel of selectors) {
    try {
      const container = document.querySelector(sel);
      if (!container) continue;

      // メッセージブロックを探す（一般的なパターン）
      // ChatGPT: [data-message-author-role="assistant"]
      // Claude: div.font-claude-message, [data-testid='message-content']
      // Gemini: message-content, model-response, [data-model-id]
      // Grok: 各メッセージブロック
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
          return htmlToMarkdown(lastMsg);
        }
      }

      // フォールバック: コンテナ全体を変換
      return htmlToMarkdown(container);
    } catch {
      continue;
    }
  }
  return "";
}

/**
 * AI応答テキストを取得する統合関数。
 * 1. まずコピーボタンのクリックを試行
 * 2. 失敗した場合は DOM から直接抽出
 *
 * @param {string} copyButtonSelector - コピーボタンのセレクタ
 * @param {string} answerContainerSelector - 回答コンテナのセレクタ
 * @returns {Promise<string>} 取得したテキスト
 */
async function getResponseText(copyButtonSelector, answerContainerSelector) {
  // 方法1: コピーボタン
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

  // 方法2: DOM から直接抽出
  const domText = extractLatestResponseFromDOM(answerContainerSelector);
  if (domText && domText.trim().length > 0) {
    return domText;
  }

  // 方法3: answerContainerSelector の innerText
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

  // 方法4: ページ全体からの最終フォールバック
  try {
    const root =
      document.querySelector("main") ||
      document.querySelector("[role='main']") ||
      document.body;
    if (root) {
      const pageText = htmlToMarkdown(root);
      if (pageText && pageText.trim().length > 0) {
        return pageText;
      }
    }
  } catch {
    // ここでの失敗は最終手段なのでそのまま空文字を返す
  }

  return "";
}

/**
 * 応答完了待ちとテキスト取得をまとめて行うヘルパー。
 * 各 content script 側ではサービス固有のセレクタだけを指定すればよい。
 *
 * 前提: content-utils.js は content-base.js より先に読み込まれる（constants.js の CONTENT_SCRIPTS で定義）。
 *
 * @param {string} copyButtonSelector - コピーボタンのセレクタ
 * @param {string} answerContainerSelector - 回答コンテナのセレクタ
 * @param {string} doneCheckSelector - 応答中に表示される要素のセレクタ（例: 停止ボタン）
 * @param {number} maxWaitMs - 応答完了までの最大待機時間
 * @param {number} stableMs - DOM安定とみなす無変更時間
 * @returns {Promise<string>} 取得したテキスト
 */
async function fetchResponseTextWithWait(
  copyButtonSelector,
  answerContainerSelector,
  doneCheckSelector,
  maxWaitMs = 15000,
  stableMs = 1500
) {
  await waitForResponseComplete(
    answerContainerSelector,
    doneCheckSelector,
    maxWaitMs,
    stableMs
  );
  return getResponseText(copyButtonSelector, answerContainerSelector);
}

window.MirrorChatUtils = {
  htmlToMarkdown,
  waitFor,
  waitForStable,
  waitForResponseComplete,
  humanDelay,
  simulateInput,
  pressEnterToSubmit,
  clickSubmitOrEnter,
  copyResponseViaClipboard,
  extractLatestResponseFromDOM,
  getResponseText,
  fetchResponseTextWithWait
};
