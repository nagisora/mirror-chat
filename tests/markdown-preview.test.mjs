import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

async function loadMarkdownPreview() {
  const code = await readFile("./ai-prompt-broadcaster/markdownPreview.js", "utf8");
  const context = vm.createContext({ self: {}, window: {}, console });
  vm.runInContext(code, context, { filename: "./ai-prompt-broadcaster/markdownPreview.js" });
  return context.self.MirrorChatMarkdownPreview;
}

test("renderMarkdown escapes HTML and renders headings", async () => {
  const preview = await loadMarkdownPreview();
  const html = preview.renderMarkdown("## 質問\n\n<script>alert(1)</script>");
  assert.match(html, /<h2>質問<\/h2>/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test("renderMarkdown renders lists and horizontal rules", async () => {
  const preview = await loadMarkdownPreview();
  const html = preview.renderMarkdown(["- 要点A", "- 要点B", "", "---", "", "本文"].join("\n"));
  assert.match(html, /<ul><li>要点A<\/li><li>要点B<\/li><\/ul>/);
  assert.match(html, /<hr>/);
  assert.match(html, /<p>本文<\/p>/);
});

test("renderToElement clears preview when markdown is empty", async () => {
  const preview = await loadMarkdownPreview();
  const element = { innerHTML: "x", classList: { add() {}, remove() {} } };
  preview.renderToElement(element, "");
  assert.equal(element.innerHTML, "");
});
