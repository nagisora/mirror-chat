import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

async function loadScript(filePath) {
  const code = await readFile(filePath, "utf8");
  const context = vm.createContext({
    self: {
      MirrorChatConstants: {
        STORAGE_KEYS: {
          FOLDER_SEQ: "folder",
          LAST_SAVED_FOLDER: "last",
          QUESTION_FILE_SEQ: "question"
        }
      }
    },
    chrome: {
      storage: {
        local: {
          get(_key, callback) {
            callback({});
          },
          set(_value, callback) {
            callback();
          }
        }
      }
    },
    console
  });
  vm.runInContext(code, context, { filename: filePath });
  return context;
}

test("replaceDigestSection keeps ChatGPT answer block intact", async () => {
  const context = await loadScript("./ai-prompt-broadcaster/obsidianStorage.js");
  const storage = context.self.MirrorChatObsidianStorage;
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

  const replaced = storage.replaceDigestSection(original, "要約本文\n\n<sub>要約モデル: openrouter/test</sub>");

  assert.equal(replaced.ok, true);
  assert.match(replaced.content, /### ChatGPT\n\nChatGPT の回答/);
  assert.match(replaced.content, /### Claude\n\nClaude の回答/);
  assert.match(replaced.content, /要約モデル: openrouter\/test/);
  assert.ok(!replaced.content.includes("MIRRORCHAT_DIGEST_START"));
  assert.ok(!replaced.content.includes("MIRRORCHAT_DIGEST_END"));
});