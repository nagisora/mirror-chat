/**
 * DOM からテキスト抽出・Markdown 変換の共通ユーティリティ
 * 各 content script から参照される
 *
 * 参考: pykrete67/prompt-queue-extension の common.js
 *       repmax/ai-chat-downloader の Markdown 変換
 */
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
 * 人間らしいランダム遅延（bot判定回避）
 */
function humanDelay(minMs = 1500, maxMs = 3000) {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * キーボードイベントシーケンスを発火（focus → click → key events）
 * prompt-queue-extension の simulateInput を参考にした人間らしい入力
 */
function dispatchKeySequence(element, key) {
  const opts = { key, bubbles: true, cancelable: true };
  element.dispatchEvent(new KeyboardEvent("keydown", opts));
  element.dispatchEvent(new KeyboardEvent("keypress", opts));
  element.dispatchEvent(new InputEvent("beforeinput", {
    bubbles: true, cancelable: true, inputType: "insertText", data: key
  }));
  element.dispatchEvent(new InputEvent("input", {
    bubbles: true, inputType: "insertText", data: key
  }));
  element.dispatchEvent(new KeyboardEvent("keyup", opts));
}

/**
 * React / ProseMirror / フレームワーク対応のテキスト入力シミュレーション
 *
 * 手法:
 * 1. contenteditable (ProseMirror等): execCommand + フルイベントシーケンス
 * 2. textarea (React等): DataTransfer を使った paste シミュレーション
 * 3. フォールバック: native setter + InputEvent
 */
function simulateInput(element, text) {
  element.focus();
  element.dispatchEvent(new MouseEvent("click", { bubbles: true }));

  const isContentEditable =
    element.isContentEditable || element.getAttribute("contenteditable") === "true";

  if (isContentEditable) {
    // ProseMirror / contenteditable 用
    // 既存テキストを全選択してから置換
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand("delete", false);

    // execCommand で挿入（ブラウザがネイティブに InputEvent を発火する）
    const inserted = document.execCommand("insertText", false, text);

    if (!inserted || !element.textContent.includes(text)) {
      // フォールバック: 直接設定 + イベント発火
      element.textContent = text;

      // カーソルを末尾に移動
      const r2 = document.createRange();
      r2.selectNodeContents(element);
      r2.collapse(false);
      sel.removeAllRanges();
      sel.addRange(r2);

      dispatchKeySequence(element, text.slice(-1));
    }
  } else {
    // textarea / input 用 — DataTransfer paste シミュレーション
    element.select();

    const dt = new DataTransfer();
    dt.setData("text/plain", text);
    const pasteEvent = new ClipboardEvent("paste", {
      bubbles: true, cancelable: true, clipboardData: dt
    });
    const handled = element.dispatchEvent(pasteEvent);

    // paste が処理されなかった場合、native setter フォールバック
    if (!handled || element.value !== text) {
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
  }

  element.dispatchEvent(new Event("change", { bubbles: true }));
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

window.MirrorChatUtils = {
  htmlToMarkdown,
  waitFor,
  waitForStable,
  humanDelay,
  simulateInput,
  clickSubmitOrEnter
};
