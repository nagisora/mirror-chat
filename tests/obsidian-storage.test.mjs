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

test("saveToObsidian writes pending digest placeholder for provider-based digest", async () => {
  const storage = new Map();
  let capturedContent = "";
  const code = await readFile("./ai-prompt-broadcaster/obsidianStorage.js", "utf8");
  const context = vm.createContext({
    self: {
      MirrorChatConstants: {
        STORAGE_KEYS: {
          FOLDER_SEQ: "folder",
          LAST_SAVED_FOLDER: "last",
          QUESTION_FILE_SEQ: "question"
        }
      },
      ObsidianClient: {
        async createNote(_baseUrl, _token, _notePath, content) {
          capturedContent = content;
          return { ok: true };
        }
      }
    },
    chrome: {
      storage: {
        local: {
          get(key, callback) {
            callback({ [key]: storage.get(key) || {} });
          },
          set(value, callback) {
            Object.entries(value).forEach(([key, entry]) => storage.set(key, entry));
            callback();
          }
        }
      }
    },
    console
  });
  vm.runInContext(code, context, { filename: "./ai-prompt-broadcaster/obsidianStorage.js" });

  const obsidianStorage = context.self.MirrorChatObsidianStorage;
  const result = await obsidianStorage.saveToObsidian(
    "質問本文",
    [{ name: "ChatGPT", markdown: "回答本文" }],
    {
      digestProvider: "opencodezen",
      obsidian: {
        baseUrl: "http://127.0.0.1:27123/",
        token: "",
        rootPath: "200-AI Research"
      }
    }
  );

  assert.equal(result.ok, true);
  assert.match(capturedContent, /## まとめ\n\n生成中.../);
});