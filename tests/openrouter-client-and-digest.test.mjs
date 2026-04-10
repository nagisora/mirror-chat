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

test("diagnoseChatCompletion returns detailed metadata for reasoning-only responses", async () => {
  const fetchImpl = async () => new Response(
    JSON.stringify({
      id: "gen-test",
      model: "reasoning/model:free",
      provider: "demo-provider",
      choices: [{
        finish_reason: "length",
        message: { role: "assistant", content: null, reasoning: "内部思考だけが返っている" }
      }],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
        completion_tokens_details: { reasoning_tokens: 50 }
      }
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
  const context = await loadScripts(["./ai-prompt-broadcaster/openRouterClient.js"], { fetch: fetchImpl });
  const client = context.self.MirrorChatOpenRouterClient;

  const result = await client.diagnoseChatCompletion({
    apiKey: "test",
    modelId: "reasoning/model:free",
    systemPrompt: "system",
    userPrompt: "user",
    fetchImpl
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /reasoning without final text/);
  assert.equal(result.analysis.finishReason, "length");
  assert.equal(result.analysis.contentKind, "null");
  assert.equal(result.analysis.reasoningTokens, 50);
  assert.equal(result.analysis.provider, "demo-provider");
  assert.equal(result.response.status, 200);
});

test("diagnoseChatCompletion keeps raw HTTP error body for diagnostics", async () => {
  const fetchImpl = async () => new Response("provider unavailable", {
    status: 503,
    statusText: "Service Unavailable",
    headers: { "content-type": "text/plain" }
  });
  const context = await loadScripts(["./ai-prompt-broadcaster/openRouterClient.js"], { fetch: fetchImpl });
  const client = context.self.MirrorChatOpenRouterClient;

  const result = await client.diagnoseChatCompletion({
    apiKey: "test",
    modelId: "broken/model:free",
    systemPrompt: "system",
    userPrompt: "user",
    fetchImpl
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /OpenRouter HTTP 503/);
  assert.equal(result.rawText, "provider unavailable");
  assert.equal(result.response.status, 503);
});

test("requestChatCompletion surfaces provider error from a 200 response", async () => {
  const fetchImpl = async () => new Response(
    JSON.stringify({
      choices: [{
        finish_reason: "error",
        message: { role: "assistant", content: null },
        error: { code: 503, message: "Provider produced no final text" }
      }]
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
  const context = await loadScripts(["./ai-prompt-broadcaster/openRouterClient.js"], { fetch: fetchImpl });
  const client = context.self.MirrorChatOpenRouterClient;

  await assert.rejects(
    client.requestChatCompletion({
      apiKey: "test",
      modelId: "provider/error:free",
      systemPrompt: "system",
      userPrompt: "user",
      fetchImpl
    }),
    /OpenRouter provider error: Provider produced no final text/
  );
});

test("requestChatCompletion reports reasoning-only completions", async () => {
  const fetchImpl = async () => new Response(
    JSON.stringify({
      choices: [{
        finish_reason: "length",
        message: { role: "assistant", content: null, reasoning: "内部思考だけが返っている" }
      }],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
        completion_tokens_details: { reasoning_tokens: 50 }
      }
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
  const context = await loadScripts(["./ai-prompt-broadcaster/openRouterClient.js"], { fetch: fetchImpl });
  const client = context.self.MirrorChatOpenRouterClient;

  await assert.rejects(
    client.requestChatCompletion({
      apiKey: "test",
      modelId: "reasoning/only:free",
      systemPrompt: "system",
      userPrompt: "user",
      fetchImpl
    }),
    /OpenRouter returned reasoning without final text \(finish_reason: length\)/
  );
});

test("generateDigest falls back to next candidate when first one fails", async () => {
  const nowSec = Math.floor(Date.now() / 1000);
  const fetchImpl = async (url, options) => {
    if (String(url).endsWith("/models")) {
      return new Response(JSON.stringify({ data: [
        { id: "a/model:free", name: "Model A 70B", created: nowSec },
        { id: "b/model:free", name: "Model B 70B", created: nowSec }
      ] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
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
  assert.equal(progressEvents[0].stage, "catalog-start");
  assert.equal(progressEvents[1].stage, "attempt-start");
  assert.equal(progressEvents[1].modelId, "a/model:free");
  assert.equal(progressEvents[2].stage, "attempt-failure");
  assert.equal(progressEvents[2].kind, "rateLimit");
  assert.equal(progressEvents[3].stage, "attempt-start");
  assert.equal(progressEvents[3].modelId, "b/model:free");
  assert.match(progressEvents[3].errorMessage, /a\/model:free/);
  assert.doesNotMatch(result.digest, /要点3行/);
  assert.match(result.digest, /^- 要点/m);
  assert.match(result.digest, /### 気になる点/);
  assert.match(result.digest, /<sub>要約モデル: openrouter\/b\/model:free<\/sub>/);
});

test("generateDigest falls back when the first model returns reasoning only", async () => {
  const nowSec = Math.floor(Date.now() / 1000);
  const fetchImpl = async (url, options) => {
    if (String(url).endsWith("/models")) {
      return new Response(JSON.stringify({ data: [
        { id: "reasoning/model:free", name: "Reasoning Model 32B", created: nowSec },
        { id: "b/model:free", name: "Model B 70B", created: nowSec }
      ] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    const body = JSON.parse(options.body);
    if (body.model === "reasoning/model:free") {
      return new Response(
        JSON.stringify({
          choices: [{
            finish_reason: "length",
            message: { role: "assistant", content: null, reasoning: "考え中" }
          }],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 80,
            total_tokens: 180,
            completion_tokens_details: { reasoning_tokens: 80 }
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
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
        preferredModel: "reasoning/model:free",
        freeModelCandidatesOverride: ["reasoning/model:free", "b/model:free"]
      }
    },
    fetchImpl,
    onProgress: async (event) => {
      progressEvents.push({ ...event });
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.modelId, "b/model:free");
  const failureEvent = progressEvents.find((event) => event.stage === "attempt-failure");
  assert.ok(failureEvent);
  assert.match(failureEvent.errorMessage, /reasoning without final text/);
});

test("generateDigest reports timeout fallback progress", async () => {
  const nowSec = Math.floor(Date.now() / 1000);
  const fetchImpl = async (url, options) => {
    if (String(url).endsWith("/models")) {
      return new Response(JSON.stringify({ data: [
        { id: "timeout/model:free", name: "Timeout Model 70B", created: nowSec },
        { id: "b/model:free", name: "Model B 70B", created: nowSec }
      ] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
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
        preferredModel: "timeout/model:free",
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
  assert.equal(progressEvents[0].stage, "catalog-start");
  assert.equal(progressEvents[2].kind, "timeout");
  assert.match(progressEvents[2].errorMessage, /freeモデル上限|provider 混雑/);
  assert.match(progressEvents[3].errorMessage, /timeout\/model:free/);
  assert.match(progressEvents[3].errorMessage, /15 秒以内/);
});

test("generateDigest reports catalog timeout fallback progress", async () => {
  const fetchImpl = async (url, options) => {
    if (String(url).endsWith("/models")) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }
    const body = JSON.parse(options.body);
    if (body.model === "a/model:free") {
      return new Response("rate limited", { status: 429, headers: { "content-type": "text/plain" } });
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
        freeModelCandidatesOverride: ["a/model:free", "b/model:free"]
      }
    },
    fetchImpl,
    onProgress: async (event) => {
      progressEvents.push({ ...event });
    }
  });

  assert.equal(result.ok, true);
  assert.equal(progressEvents[0].stage, "catalog-start");
  assert.equal(progressEvents[1].stage, "catalog-failure");
  assert.equal(progressEvents[1].kind, "timeout");
  assert.match(progressEvents[1].errorMessage, /free候補取得が 8 秒/);
});

test("buildDigestPrompt compacts long source text", async () => {
  const context = await loadScripts(
    [
      "./ai-prompt-broadcaster/openRouterFreeModels.js",
      "./ai-prompt-broadcaster/openRouterClient.js",
      "./ai-prompt-broadcaster/digestService.js"
    ],
    { fetch: async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }) }
  );
  const digestService = context.self.MirrorChatDigestService;

  const longQuestion = "Q".repeat(1400);
  const longAnswer = `前半${"A".repeat(3800)}後半`;
  const prompt = digestService.buildDigestPrompt(longQuestion, [
    { name: "ChatGPT", markdown: longAnswer, error: "" },
    { name: "Claude", markdown: "", error: "タイムアウト" }
  ]);

  assert.match(prompt.systemPrompt, /読書メモ/);
  assert.match(prompt.userPrompt, /\[中略: /);
  assert.match(prompt.userPrompt, /理由: タイムアウト/);
  assert.match(prompt.userPrompt, /後半/);
});