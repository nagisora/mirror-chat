import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

async function loadNoteContentBuilder() {
  const code = await readFile("./ai-prompt-broadcaster/noteContentBuilder.js", "utf8");
  const context = vm.createContext({ self: {}, console });
  vm.runInContext(code, context, { filename: "./ai-prompt-broadcaster/noteContentBuilder.js" });
  return context.self.MirrorChatNoteContentBuilder;
}

test("isObsidianConfigured returns false for empty baseUrl", async () => {
  const builder = await loadNoteContentBuilder();
  assert.equal(builder.isObsidianConfigured({ obsidian: { baseUrl: "" } }), false);
  assert.equal(builder.isObsidianConfigured({ obsidian: { baseUrl: "   " } }), false);
  assert.equal(
    builder.isObsidianConfigured({ obsidian: { baseUrl: "http://127.0.0.1:27123/" } }),
    true
  );
});

test("buildQuestionAnswersContent includes digest placeholder when digest enabled", async () => {
  const builder = await loadNoteContentBuilder();
  const content = builder.buildQuestionAnswersContent(
    "質問本文",
    [{ name: "ChatGPT", markdown: "回答本文" }],
    { digestProvider: "openrouter" }
  );
  assert.match(content, /## 質問\n\n質問本文/);
  assert.match(content, /## まとめ\n\n生成中\.\.\./);
  assert.match(content, /### ChatGPT\n\n回答本文/);
});

test("replaceDigestSection keeps ChatGPT answer block intact", async () => {
  const builder = await loadNoteContentBuilder();
  const original = [
    "## 質問",
    "",
    "質問本文",
    "",
    "---",
    "",
    "## まとめ",
    "",
    "生成中...",
    "",
    "---",
    "",
    "## 各AI回答",
    "",
    "### ChatGPT",
    "",
    "ChatGPT の回答",
    "",
    "---",
    "",
    "### Claude",
    "",
    "Claude の回答"
  ].join("\n");

  const replaced = builder.replaceDigestSection(
    original,
    "要約本文\n\n<sub>要約モデル: openrouter/test</sub>"
  );

  assert.equal(replaced.ok, true);
  assert.match(replaced.content, /### ChatGPT\n\nChatGPT の回答/);
  assert.match(replaced.content, /### Claude\n\nClaude の回答/);
  assert.match(replaced.content, /要約モデル: openrouter\/test/);
  assert.ok(!replaced.content.includes("MIRRORCHAT_DIGEST_START"));
});
