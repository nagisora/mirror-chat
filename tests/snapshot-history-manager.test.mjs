import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

async function loadManager() {
  const code = await readFile("./ai-prompt-broadcaster/snapshotHistoryManager.js", "utf8");
  const storage = new Map();
  const context = vm.createContext({
    self: {
      MirrorChatConstants: {
        STORAGE_KEYS: {
          SNAPSHOT_HISTORY: "mirrorchatSnapshotHistory",
          LAST_NOTE_SNAPSHOT: "mirrorchatLastNoteSnapshot"
        }
      }
    },
    chrome: {
      runtime: { lastError: null },
      storage: {
        local: {
          get(keys, callback) {
            const keyList = Array.isArray(keys) ? keys : [keys];
            const result = {};
            keyList.forEach((key) => {
              if (storage.has(key)) result[key] = storage.get(key);
            });
            callback(result);
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
  vm.runInContext(code, context, { filename: "./ai-prompt-broadcaster/snapshotHistoryManager.js" });
  return { manager: context.self.MirrorChatSnapshotHistoryManager, storage };
}

test("appendSnapshot adds entries newest-first", async () => {
  const { manager } = await loadManager();
  const first = await manager.appendSnapshot({
    question: "質問1",
    results: [],
    exportMarkdown: "md1",
    savedAt: 1000
  });
  const second = await manager.appendSnapshot({
    question: "質問2",
    results: [],
    exportMarkdown: "md2",
    savedAt: 2000
  });
  const history = await manager.readSnapshotHistory();
  assert.equal(history.length, 2);
  assert.equal(history[0].id, second.id);
  assert.equal(history[1].id, first.id);
});

test("updateSnapshot replaces exportMarkdown for the same id", async () => {
  const { manager } = await loadManager();
  const entry = await manager.appendSnapshot({
    question: "質問",
    results: [],
    exportMarkdown: "before",
    savedAt: 1000
  });
  await manager.updateSnapshot(entry.id, {
    ...entry,
    exportMarkdown: "after"
  });
  const updated = await manager.getSnapshotById(entry.id);
  assert.equal(updated.exportMarkdown, "after");
});

test("migrateLegacySnapshot imports last note snapshot", async () => {
  const { manager, storage } = await loadManager();
  storage.set("mirrorchatLastNoteSnapshot", {
    question: "旧データ",
    results: [{ name: "ChatGPT", markdown: "a" }],
    exportMarkdown: "legacy",
    savedAt: 500
  });
  const history = await manager.readSnapshotHistory();
  assert.equal(history.length, 1);
  assert.equal(history[0].question, "旧データ");
  assert.ok(history[0].id);
});
