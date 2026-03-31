import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

async function loadScripts(filePaths, extraContext = {}) {
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
  for (const filePath of filePaths) {
    const code = await readFile(filePath, "utf8");
    vm.runInContext(code, context, { filename: filePath });
  }
  return context;
}

test("fetchModelsCatalog returns the models array", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ data: [{ id: "a/model:free" }] }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
  const context = await loadScripts(["./ai-prompt-broadcaster/openRouterClient.js"], { fetch: fetchImpl });
  const client = context.self.MirrorChatOpenRouterClient;

  const result = await client.fetchModelsCatalog({ apiKey: "test", fetchImpl });
  assert.deepEqual(result, [{ id: "a/model:free" }]);
});

test("generateDigest falls back to next candidate when first one fails", async () => {
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.model === "a/model:free") {
      return new Response("rate limited", { status: 429, headers: { "content-type": "text/plain" } });
    }
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: "- 要点\n- 要点2\n- 要点3\n\n### 補足\n- 補足\n\n### 気になる点\n- 確認したいこと" } }]
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };
  const context = await loadScripts(
    [
      "./ai-prompt-broadcaster/openRouterFreeModels.js",
      "./ai-prompt-broadcaster/openRouterClient.js",
      "./ai-prompt-broadcaster/digestService.js"
    ],
    { fetch: fetchImpl }
  );
  const digestService = context.self.MirrorChatDigestService;
  const progressEvents = [];

  const result = await digestService.generateDigest({
    question: "質問",
    results: [{ name: "ChatGPT", markdown: "回答", error: "" }],
    settings: {
      openrouter: {
        apiKey: "test",
        freeModelCandidatesOverride: ["a/model:free", "b/model:free"]
      }
    },
    fetchImpl,
    onProgress: async (event) => {
      progressEvents.push({ ...event });
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.modelId, "b/model:free");
  assert.equal(progressEvents[0].stage, "attempt-start");
  assert.equal(progressEvents[0].modelId, "a/model:free");
  assert.equal(progressEvents[1].stage, "attempt-failure");
  assert.equal(progressEvents[1].kind, "rateLimit");
  assert.equal(progressEvents[2].stage, "attempt-start");
  assert.equal(progressEvents[2].modelId, "b/model:free");
  assert.match(progressEvents[2].errorMessage, /a\/model:free/);
  assert.doesNotMatch(result.digest, /要点3行/);
  assert.match(result.digest, /^- 要点/m);
  assert.match(result.digest, /### 気になる点/);
  assert.match(result.digest, /<sub>要約モデル: openrouter\/b\/model:free<\/sub>/);
});

test("generateDigest reports timeout fallback progress", async () => {
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.model === "timeout/model:free") {
      throw new DOMException("The operation was aborted.", "AbortError");
    }
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: "- 要点\n- 要点2\n- 要点3\n\n### 補足\n- 補足\n\n### 気になる点\n- 確認" } }]
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };
  const context = await loadScripts(
    [
      "./ai-prompt-broadcaster/openRouterFreeModels.js",
      "./ai-prompt-broadcaster/openRouterClient.js",
      "./ai-prompt-broadcaster/digestService.js"
    ],
    { fetch: fetchImpl, DOMException }
  );
  const digestService = context.self.MirrorChatDigestService;
  const progressEvents = [];

  const result = await digestService.generateDigest({
    question: "質問",
    results: [{ name: "ChatGPT", markdown: "回答", error: "" }],
    settings: {
      openrouter: {
        apiKey: "test",
        freeModelCandidatesOverride: ["timeout/model:free", "b/model:free"]
      }
    },
    fetchImpl,
    onProgress: async (event) => {
      progressEvents.push({ ...event });
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.modelId, "b/model:free");
  assert.equal(progressEvents[1].kind, "timeout");
  assert.match(progressEvents[1].errorMessage, /タイムアウト/);
  assert.match(progressEvents[2].errorMessage, /timeout\/model:free/);
  assert.match(progressEvents[2].errorMessage, /15 秒以内/);
});