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

window.MirrorChatUtils = { htmlToMarkdown, waitFor };

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

window.MirrorChatUtils.waitForStable = waitForStable;
