import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

async function loadNoteContentBuilder(context) {
  const code = await readFile("./ai-prompt-broadcaster/noteContentBuilder.js", "utf8");
  vm.runInContext(code, context, { filename: "./ai-prompt-broadcaster/noteContentBuilder.js" });
}

async function loadObsidianStorage(extraContext = {}) {
  const storageKeys = {
    FOLDER_SEQ: "folder",
    LAST_SAVED_FOLDER: "last",
    QUESTION_FILE_SEQ: "question"
  };
  const context = vm.createContext({
    self: {
      MirrorChatConstants: {
        STORAGE_KEYS: storageKeys
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
    console,
    ...extraContext
  });
  await loadNoteContentBuilder(context);
  const code = await readFile("./ai-prompt-broadcaster/obsidianStorage.js", "utf8");
  vm.runInContext(code, context, { filename: "./ai-prompt-broadcaster/obsidianStorage.js" });
  return context;
}

test("saveToObsidian skips REST when baseUrl is empty", async () => {
  const storage = new Map();
  let createNoteCalls = 0;
  const context = await loadObsidianStorage({
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
    self: {
      MirrorChatConstants: {
        STORAGE_KEYS: {
          FOLDER_SEQ: "folder",
          LAST_SAVED_FOLDER: "last",
          QUESTION_FILE_SEQ: "question"
        }
      },
      ObsidianClient: {
        async createNote() {
          createNoteCalls += 1;
          return { ok: true };
        }
      }
    }
  });

  const obsidianStorage = context.self.MirrorChatObsidianStorage;
  const result = await obsidianStorage.saveToObsidian(
    "質問本文",
    [{ name: "ChatGPT", markdown: "回答本文" }],
    {
      obsidian: {
        baseUrl: "",
        token: "",
        rootPath: "200-AI Research"
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.skipped, true);
  assert.equal(result.notePath, null);
  assert.ok(result.basePath);
  assert.ok(result.fileName);
  assert.equal(createNoteCalls, 0);
  assert.equal(storage.get("last"), result.basePath);
});

test("appendToObsidian skips REST and advances question file seq", async () => {
  const storage = new Map();
  let createNoteCalls = 0;
  const context = await loadObsidianStorage({
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
    self: {
      MirrorChatConstants: {
        STORAGE_KEYS: {
          FOLDER_SEQ: "folder",
          LAST_SAVED_FOLDER: "last",
          QUESTION_FILE_SEQ: "question"
        }
      },
      ObsidianClient: {
        async createNote() {
          createNoteCalls += 1;
          return { ok: true };
        }
      }
    }
  });

  const obsidianStorage = context.self.MirrorChatObsidianStorage;
  const basePath = "200-AI Research/20260101-01-test";
  const first = await obsidianStorage.appendToObsidian(
    basePath,
    "続きの質問",
    [{ name: "ChatGPT", markdown: "回答" }],
    { obsidian: { baseUrl: "", token: "", rootPath: "200-AI Research" } }
  );
  const second = await obsidianStorage.appendToObsidian(
    basePath,
    "続きの質問2",
    [{ name: "ChatGPT", markdown: "回答2" }],
    { obsidian: { baseUrl: "", token: "", rootPath: "200-AI Research" } }
  );

  assert.equal(first.ok, true);
  assert.equal(first.skipped, true);
  assert.equal(second.ok, true);
  assert.equal(createNoteCalls, 0);
  assert.notEqual(first.fileName, second.fileName);
});

test("saveToObsidian writes pending digest placeholder for provider-based digest", async () => {
  const storage = new Map();
  let capturedContent = "";
  const context = await loadObsidianStorage({
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
    }
  });

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
  assert.match(capturedContent, /## まとめ\n\n生成中\.\.\./);
});

test("rewriteNoteContentInObsidian preserves provided markdown content", async () => {
  let capturedContent = "";
  const context = await loadObsidianStorage({
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
    }
  });

  const obsidianStorage = context.self.MirrorChatObsidianStorage;
  const content = "## 質問\n\nQ\n\n---\n\n## まとめ\n\n既存のまとめ";
  const result = await obsidianStorage.rewriteNoteContentInObsidian(
    "path/to/note.md",
    content,
    {
      obsidian: {
        baseUrl: "http://127.0.0.1:27123/",
        token: "",
        rootPath: "200-AI Research"
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(capturedContent, content);
});
