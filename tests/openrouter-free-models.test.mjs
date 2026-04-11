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
  const started = [];
  const failed = [];

  const result = await models.tryCandidates({
    candidates: ["a/model:free", "b/model:free"],
    onAttemptStart: async ({ modelId }) => {
      started.push(modelId);
    },
    onAttemptFailure: async ({ modelId, kind }) => {
      failed.push(`${modelId}:${kind}`);
    },
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
  assert.deepEqual(started, ["a/model:free", "b/model:free"]);
  assert.deepEqual(failed, ["a/model:free:noProviders"]);
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
  assert.equal(refreshed.stats.digestCompatibleCount, 3);
  assert.equal(refreshed.stats.finalCount, 1);
});

test("refreshDigestFreeModels prioritizes collection-ranked digest models", async () => {
  const context = await loadScript("./ai-prompt-broadcaster/openRouterFreeModels.js");
  const models = context.self.MirrorChatOpenRouterFreeModels;
  const nowSec = Math.floor(Date.now() / 1000);

  const refreshed = models.refreshDigestFreeModels({
    catalog: [
      { id: "meta-llama/llama-3.3-70b-instruct:free", name: "Llama 3.3 70B", created: nowSec - 100 },
      { id: "qwen/qwen3-next-80b-a3b-instruct:free", name: "Qwen3 Next 80B A3B", created: nowSec - 1000 },
      { id: "google/gemma-4-31b-it:free", name: "Gemma 4 31B", created: nowSec - 10 }
    ]
  });

  assert.deepEqual(Array.from(refreshed.candidates), [
    "google/gemma-4-31b-it:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "qwen/qwen3-next-80b-a3b-instruct:free"
  ]);
});

test("refreshDigestFreeModels excludes embed and vl models from digest candidates", async () => {
  const context = await loadScript("./ai-prompt-broadcaster/openRouterFreeModels.js");
  const models = context.self.MirrorChatOpenRouterFreeModels;
  const nowSec = Math.floor(Date.now() / 1000);

  const refreshed = models.refreshDigestFreeModels({
    catalog: [
      { id: "nvidia/llama-nemotron-embed-vl-1b-v2:free", name: "Embed VL 1B", created: nowSec },
      { id: "nvidia/nemotron-nano-12b-v2-vl:free", name: "Nemotron Nano 12B 2 VL", created: nowSec },
      { id: "minimax/minimax-m2.5:free", name: "MiniMax M2.5 39B", created: nowSec }
    ],
    minParamB: 0
  });

  assert.deepEqual(Array.from(refreshed.candidates), ["minimax/minimax-m2.5:free"]);
  assert.equal(refreshed.stats.freeCount, 3);
  assert.equal(refreshed.stats.digestCompatibleCount, 1);
});

test("buildSelectOptions includes collection-ranked models even when not in stored candidates", async () => {
  const context = await loadScript("./ai-prompt-broadcaster/openRouterFreeModels.js");
  const models = context.self.MirrorChatOpenRouterFreeModels;

  const options = models.buildSelectOptions({
    candidates: ["meta-llama/llama-3.3-70b-instruct:free"]
  });
  const values = options.map((option) => option.value);

  assert.ok(values.includes("z-ai/glm-4.5-air:free"));
  assert.ok(values.includes("meta-llama/llama-3.3-70b-instruct:free"));
});

test("summarizeModelAvailability separates digest candidates from selectable models", async () => {
  const context = await loadScript("./ai-prompt-broadcaster/openRouterFreeModels.js");
  const models = context.self.MirrorChatOpenRouterFreeModels;

  const summary = models.summarizeModelAvailability({
    candidates: ["meta-llama/llama-3.3-70b-instruct:free"],
    stats: { freeCount: 24 },
    lastRefreshAt: "2026-04-11T00:00:00.000Z"
  });

  assert.equal(summary.digestCandidateCount, 1);
  assert.ok(summary.selectableCount > summary.digestCandidateCount);
  assert.equal(summary.freeCount, 24);
  assert.equal(summary.hasRefreshInfo, true);
});

test("refreshDigestFreeModels keeps collection-ranked models when created date is missing", async () => {
  const context = await loadScript("./ai-prompt-broadcaster/openRouterFreeModels.js");
  const models = context.self.MirrorChatOpenRouterFreeModels;

  const refreshed = models.refreshDigestFreeModels({
    catalog: [
      { id: "z-ai/glm-4.5-air:free", name: "GLM 4.5 Air" },
      { id: "meta-llama/llama-3.3-70b-instruct:free", name: "Llama 3.3 70B" }
    ]
  });

  assert.ok(Array.from(refreshed.candidates).includes("z-ai/glm-4.5-air:free"));
});