/**
 * 拡張ポップアップ用の軽量 Markdown → HTML プレビュー（XSS 対策のためエスケープ後に変換）
 */
(function () {
  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderInline(text) {
    let html = escapeHtml(text);
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_match, label, url) => {
      const safeUrl = escapeHtml(url);
      return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    });
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/__([^_]+)__/g, "<strong>$1</strong>");
    html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    return html;
  }

  function isHrLine(line) {
    return /^(\*{3,}|-{3,}|_{3,})\s*$/.test(line.trim());
  }

  function isListItem(line) {
    return /^(\s*)([-*+]|\d+\.)\s+(.+)$/.exec(line);
  }

  function renderList(lines, startIndex) {
    const first = isListItem(lines[startIndex]);
    if (!first) return { html: "", nextIndex: startIndex };
    const ordered = /^\d+\./.test(first[2]);
    const tag = ordered ? "ol" : "ul";
    const items = [];
    let index = startIndex;
    while (index < lines.length) {
      const match = isListItem(lines[index]);
      if (!match) break;
      const itemOrdered = /^\d+\./.test(match[2]);
      if (itemOrdered !== ordered) break;
      items.push(`<li>${renderInline(match[3])}</li>`);
      index += 1;
    }
    return { html: `<${tag}>${items.join("")}</${tag}>`, nextIndex: index };
  }

  function renderParagraph(lines, startIndex) {
    const parts = [];
    let index = startIndex;
    while (index < lines.length) {
      const line = lines[index];
      if (!line.trim()) break;
      if (isHrLine(line) || /^(#{1,6})\s+/.test(line) || isListItem(line) || /^```/.test(line)) {
        break;
      }
      parts.push(renderInline(line));
      index += 1;
    }
    return { html: `<p>${parts.join("<br>")}</p>`, nextIndex: index };
  }

  function renderMarkdown(markdown) {
    const lines = String(markdown || "").split(/\r?\n/);
    const blocks = [];
    let index = 0;

    while (index < lines.length) {
      const line = lines[index];

      if (/^```/.test(line)) {
        const fence = line.match(/^```(\w*)/);
        const codeLines = [];
        index += 1;
        while (index < lines.length && !/^```/.test(lines[index])) {
          codeLines.push(escapeHtml(lines[index]));
          index += 1;
        }
        if (index < lines.length && /^```/.test(lines[index])) {
          index += 1;
        }
        const lang = fence?.[1] ? ` class="language-${escapeHtml(fence[1])}"` : "";
        blocks.push(`<pre><code${lang}>${codeLines.join("\n")}</code></pre>`);
        continue;
      }

      if (isHrLine(line)) {
        blocks.push("<hr>");
        index += 1;
        continue;
      }

      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        const level = heading[1].length;
        blocks.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
        index += 1;
        continue;
      }

      if (isListItem(line)) {
        const list = renderList(lines, index);
        blocks.push(list.html);
        index = list.nextIndex;
        continue;
      }

      if (!line.trim()) {
        index += 1;
        continue;
      }

      const paragraph = renderParagraph(lines, index);
      blocks.push(paragraph.html);
      index = paragraph.nextIndex;
    }

    return blocks.join("\n");
  }

  function renderToElement(element, markdown) {
    if (!element) return;
    const text = String(markdown || "").trim();
    if (!text) {
      element.innerHTML = "";
      element.classList.add("is-empty");
      return;
    }
    element.classList.remove("is-empty");
    element.innerHTML = renderMarkdown(text);
  }

  const api = {
    escapeHtml,
    renderInline,
    renderMarkdown,
    renderToElement
  };

  if (typeof self !== "undefined") {
    self.MirrorChatMarkdownPreview = api;
  }
  if (typeof window !== "undefined") {
    window.MirrorChatMarkdownPreview = api;
  }
})();
