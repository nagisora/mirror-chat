import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

async function loadScript(filePath, extraContext = {}) {
  const code = await readFile(filePath, "utf8");
  const context = vm.createContext({
    self: {
      MirrorChatConstants: {
        STORAGE_KEYS: {
          CURRENT_TASK: "mirrorchatCurrentTask",
          LAST_NOTE_SNAPSHOT: "mirrorchatLastNoteSnapshot"
        }
      }
    },
    chrome: {},
    console,
    ...extraContext
  });
  vm.runInContext(code, context, { filename: filePath });
  return context;
}

test("currentTaskManager stores, loads, and clears the current task", async () => {
  const storage = new Map();
  const context = await loadScript("./ai-prompt-broadcaster/currentTaskManager.js", {
    chrome: {
      runtime: { lastError: null },
      storage: {
        local: {
          get(key, callback) {
            callback({ [key]: storage.get(key) });
          },
          set(value, callback) {
            Object.entries(value).forEach(([key, entry]) => storage.set(key, entry));
            callback();
          },
          remove(key, callback) {
            storage.delete(key);
            callback();
          }
        }
      }
    }
  });
  const manager = context.self.MirrorChatCurrentTaskManager;
  const task = { prompt: "質問", createdAt: 1, isFollowUp: true, enabledAIs: ["gemini"] };

  await manager.setCurrentTask(task);
  assert.deepEqual(await manager.getCurrentTask(), task);

  await manager.clearCurrentTask();
  assert.equal(await manager.getCurrentTask(), null);
});

test("lastNoteSnapshotManager reads and writes snapshots", async () => {
  const storage = new Map();
  const context = await loadScript("./ai-prompt-broadcaster/lastNoteSnapshotManager.js", {
    chrome: {
      runtime: { lastError: null },
      storage: {
        local: {
          get(key, callback) {
            callback({ [key]: storage.get(key) });
          },
          set(value, callback) {
            Object.entries(value).forEach(([key, entry]) => storage.set(key, entry));
            callback();
          }
        }
      }
    }
  });
  const manager = context.self.MirrorChatLastNoteSnapshotManager;
  const snapshot = { notePath: "folder/file.md", question: "質問", results: [] };

  assert.equal(await manager.readLastNoteSnapshot(), null);
  await manager.writeLastNoteSnapshot(snapshot);
  assert.deepEqual(await manager.readLastNoteSnapshot(), snapshot);
});

test("offscreenManager creates the offscreen document only once for concurrent calls", async () => {
  const created = [];
  let existingContexts = [];
  let resolveCreate;
  const createPromise = new Promise((resolve) => {
    resolveCreate = resolve;
  });

  const context = await loadScript("./ai-prompt-broadcaster/offscreenManager.js", {
    chrome: {
      runtime: {
        getURL(path) {
          return `chrome-extension://test/${path}`;
        },
        async getContexts() {
          return existingContexts;
        }
      },
      offscreen: {
        createDocument(options) {
          created.push(options);
          return createPromise;
        }
      }
    }
  });
  const manager = context.self.MirrorChatOffscreenManager;

  const first = manager.ensureOffscreenDocument();
  const second = manager.ensureOffscreenDocument();

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(created.length, 1);
  resolveCreate();
  await Promise.all([first, second]);

  existingContexts = [{ contextType: "OFFSCREEN_DOCUMENT" }];
  await manager.ensureOffscreenDocument();
  assert.equal(created.length, 1);
});