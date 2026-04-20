import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

async function loadStorageContext(storedSettings) {
  const code = await readFile("./ai-prompt-broadcaster/storage.js", "utf8");
  const context = vm.createContext({
    self: {
      MirrorChatConstants: {
        STORAGE_KEYS: {
          SETTINGS: "mirrorchatSettings"
        },
        AI_KEYS: ["chatgpt", "claude", "gemini", "grok"],
        AI_DEFAULT_ORDER: ["gemini", "chatgpt", "claude", "grok"],
        AI_CONFIG_DEFAULTS: {}
      },
      MirrorChatAIOrderUtils: {
        normalizeAiOrder(value) {
          return Array.isArray(value) && value.length > 0
            ? value
            : ["gemini", "chatgpt", "claude", "grok"];
        }
      }
    },
    window: undefined,
    chrome: {
      storage: {
        sync: {
          get(_key, callback) {
            callback({ mirrorchatSettings: storedSettings });
          },
          set(_value, callback) {
            callback();
          }
        }
      }
    },
    console
  });
  vm.runInContext(code, context, { filename: "./ai-prompt-broadcaster/storage.js" });
  return context;
}

test("getSettings migrates legacy openrouter enableDigest to digestProvider", async () => {
  const context = await loadStorageContext({
    openrouter: {
      enableDigest: true,
      apiKey: "test"
    }
  });

  const storage = context.self.MirrorChatStorage;
  const settings = await storage.getSettings();

  assert.equal(settings.digestProvider, "openrouter");
  assert.equal(settings.openrouter.apiKey, "test");
});