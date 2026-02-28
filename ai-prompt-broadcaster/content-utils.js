/**
 * DOM からテキスト抽出・Markdown 変換の共通ユーティリティ
 * 各 content script から参照される
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
 * React / フレームワーク対応のテキスト入力シミュレーション
 * 単に .value や .innerText を設定するだけでは React の内部状態が更新されない。
 * native setter や execCommand を使って正しくイベントを発火させる。
 */
function simulateInput(element, text) {
  element.focus();

  const isContentEditable =
    element.isContentEditable || element.getAttribute("contenteditable") === "true";

  if (isContentEditable) {
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    sel.removeAllRanges();
    sel.addRange(range);

    const inserted = document.execCommand("insertText", false, text);
    if (!inserted || !element.textContent.includes(text)) {
      element.textContent = text;
      element.dispatchEvent(new InputEvent("input", {
        bubbles: true, inputType: "insertText", data: text
      }));
    }
  } else {
    // textarea / input — React の native setter trick
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
 * 送信ボタンが有効になるのを待ってクリック。
 * フレームワークが入力を検知→再レンダリング→ボタン有効化 の遅延に対応。
 * ボタンが見つからない/無効のままの場合は Enter キーでフォールバック送信。
 */
async function clickSubmitOrEnter(submitSelector, inputElement, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const btn = document.querySelector(submitSelector);
    if (btn && !btn.disabled && !btn.getAttribute("aria-disabled")) {
      btn.click();
      return true;
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  // フォールバック: Enter キーで送信
  if (inputElement) {
    inputElement.focus();
    inputElement.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true
    }));
    return true;
  }
  return false;
}

window.MirrorChatUtils = {
  htmlToMarkdown,
  waitFor,
  waitForStable,
  simulateInput,
  clickSubmitOrEnter
};
