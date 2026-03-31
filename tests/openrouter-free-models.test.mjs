import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

async function loadScript(filePath, extraContext = {}) {
  const code = await readFile(filePath, "utf8");
  const context = vm.createContext({
    self: {},
    window: undefined,
    console,
    setTimeout,
    clearTimeout,
    AbortController,
    Response,
    fetch: extraContext.fetch,
    ...extraContext
  });
  vm.runInContext(code, context, { filename: filePath });
  return context;
}

test("tryCandidates falls back after noProviders error", async () => {
  const context = await loadScript("./ai-prompt-broadcaster/openRouterFreeModels.js");
  const models = context.self.MirrorChatOpenRouterFreeModels;
  const seen = [];

  const result = await models.tryCandidates({
    candidates: ["a/model:free", "b/model:free"],
    attempt: async (modelId) => {
      seen.push(modelId);
      if (modelId === "a/model:free") {
        throw new Error("No allowed providers are available for the selected model.");
      }
      return "digest ok";
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.modelId, "b/model:free");
  assert.deepEqual(seen, ["a/model:free", "b/model:free"]);
  assert.equal(result.attempts[0].kind, "noProviders");
});

test("refreshDigestFreeModels filters small and old free models", async () => {
  const context = await loadScript("./ai-prompt-broadcaster/openRouterFreeModels.js");
  const models = context.self.MirrorChatOpenRouterFreeModels;
  const nowSec = Math.floor(Date.now() / 1000);
  const oldSec = nowSec - 400 * 24 * 60 * 60;

  const refreshed = models.refreshDigestFreeModels({
    catalog: [
      { id: "google/gemma-3-27b-it:free", name: "Gemma 27B", created: nowSec },
      { id: "acme/tiny-7b:free", name: "Tiny 7B", created: nowSec },
      { id: "acme/old-70b:free", name: "Old 70B", created: oldSec },
      { id: "acme/paid-70b", name: "Paid 70B", created: nowSec }
    ]
  });

  assert.deepEqual(Array.from(refreshed.candidates), ["google/gemma-3-27b-it:free"]);
  assert.equal(refreshed.stats.freeCount, 3);
  assert.equal(refreshed.stats.finalCount, 1);
});