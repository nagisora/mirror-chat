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
        choices: [{ message: { content: "### 要点3行\n- 要点\n- 要点2\n- 要点3" } }]
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

  const result = await digestService.generateDigest({
    question: "質問",
    results: [{ name: "ChatGPT", markdown: "回答", error: "" }],
    settings: {
      openrouter: {
        apiKey: "test",
        freeModelCandidatesOverride: ["a/model:free", "b/model:free"]
      }
    },
    fetchImpl
  });

  assert.equal(result.ok, true);
  assert.equal(result.modelId, "b/model:free");
  assert.match(result.digest, /要点3行/);
  assert.match(result.digest, /<sub>要約モデル: openrouter\/b\/model:free<\/sub>/);
});