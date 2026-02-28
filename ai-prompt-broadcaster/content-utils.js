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
 * ProseMirror (ChatGPT, Claude) では execCommand("insertText") が効かない。
 * ClipboardEvent("paste") を使うと ProseMirror が自前で処理してくれる。
 *
 * 手法の優先順:
 * 1. ClipboardEvent paste（ProseMirror/contenteditable で最も確実）
 * 2. execCommand("insertText")（一部の contenteditable 用フォールバック）
 * 3. native setter + InputEvent（React textarea 用）
 */
function simulateInput(element, text) {
  element.focus();
  element.dispatchEvent(new MouseEvent("click", { bubbles: true }));

  const isContentEditable =
    element.isContentEditable || element.getAttribute("contenteditable") === "true";

  if (isContentEditable) {
    // ProseMirror / contenteditable 用
    // 既存テキストを全選択してから削除
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand("delete", false);

    // 手法1: ClipboardEvent paste（ProseMirror はこれを自前で処理する）
    const dt = new DataTransfer();
    dt.setData("text/plain", text);
    element.dispatchEvent(new ClipboardEvent("paste", {
      bubbles: true, cancelable: true, clipboardData: dt
    }));

    // paste で入力されたか確認
    if (!element.textContent.includes(text)) {
      // 手法2: execCommand("insertText") フォールバック
      document.execCommand("insertText", false, text);
    }

    if (!element.textContent.includes(text)) {
      // 手法3: 直接設定 + イベント発火
      element.textContent = text;
      const r2 = document.createRange();
      r2.selectNodeContents(element);
      r2.collapse(false);
      sel.removeAllRanges();
      sel.addRange(r2);
      dispatchKeySequence(element, text.slice(-1));
    }
  } else {
    // textarea / input 用
    element.select();

    // 手法1: native setter（React で最も確実）
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

window.MirrorChatUtils = {
  htmlToMarkdown,
  waitFor,
  waitForStable,
  humanDelay,
  simulateInput,
  pressEnterToSubmit,
  clickSubmitOrEnter
};
