(function () {
  const openRouterClient = self.MirrorChatOpenRouterClient;
  const freeModelSelector = self.MirrorChatOpenRouterFreeModels;
  const DIGEST_MODEL_TIMEOUT_MS = 15000;
  const DIGEST_CATALOG_TIMEOUT_MS = 8000;
  const MAX_DIGEST_QUESTION_CHARS = 1200;
  const MAX_DIGEST_ANSWER_CHARS = 3500;

  function summarizeAttemptError({ modelId, kind, message }) {
    if (kind === "timeout") {
      return `${modelId} が ${Math.round(DIGEST_MODEL_TIMEOUT_MS / 1000)} 秒以内に応答しませんでした。freeモデル上限や provider 混雑の可能性があるため、別モデルへ切り替えます。`;
    }
    if (kind === "rateLimit") return `${modelId} はレート制限のため利用できません。別モデルへ切り替えます。`;
    if (kind === "noProviders") return `${modelId} は利用可能な provider がありません。別モデルへ切り替えます。`;
    return `${modelId} で失敗しました: ${String(message || "不明なエラー")}`;
  }

  function summarizeCatalogError({ kind, message }) {
    if (kind === "timeout") {
      return `free候補取得が ${Math.round(DIGEST_CATALOG_TIMEOUT_MS / 1000)} 秒でタイムアウトしました。保存済み候補で続行します。`;
    }
    if (kind === "rateLimit") {
      return "free候補取得がレート制限にかかりました。保存済み候補で続行します。";
    }
    return `free候補取得に失敗しました: ${String(message || "不明なエラー")}`;
  }

  function isDigestEnabled(settings) {
    return !!settings?.openrouter?.enableDigest;
  }

  function buildDigestFailureText(message) {
    return `生成に失敗しました。\n\n${String(message || "Unknown error")}`;
  }

  function normalizeDigestSourceText(text) {
    return String(text || "")
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function compactDigestSourceText(text, maxChars) {
    const normalized = normalizeDigestSourceText(text);
    if (!normalized) return "";
    if (normalized.length <= maxChars) return normalized;

    const headLength = Math.max(0, Math.floor(maxChars * 0.72));
    const tailLength = Math.max(0, maxChars - headLength - 24);
    const head = normalized.slice(0, headLength).trimEnd();
    const tail = tailLength > 0 ? normalized.slice(-tailLength).trimStart() : "";
    const omitted = normalized.length - head.length - tail.length;
    return tail
      ? `${head}\n\n[中略: ${omitted} 文字]\n\n${tail}`
      : `${head}\n\n[中略: ${omitted} 文字]`;
  }

  function buildDigestSourceBlock(result) {
    const name = String(result?.name || "AI");
    const markdown = compactDigestSourceText(result?.markdown, MAX_DIGEST_ANSWER_CHARS);
    if (markdown) {
      return `### ${name}\n${markdown}`;
    }
    const errorText = normalizeDigestSourceText(result?.error);
    return `### ${name}\n(取得できませんでした)${errorText ? `\n理由: ${errorText}` : ""}`;
  }

  function buildDigestBody({ digestMarkdown, modelId }) {
    return [
      digestMarkdown,
      "",
      `<sub>要約モデル: openrouter/${modelId}</sub>`
    ].join("\n");
  }

  function buildDigestPrompt(question, results) {
    const compactQuestion = compactDigestSourceText(question, MAX_DIGEST_QUESTION_CHARS);
    const answerBlocks = results.map((result) => buildDigestSourceBlock(result)).join("\n\n");

    return {
      systemPrompt: [
        "複数AI回答を、読み返しやすい日本語の読書メモに要約してください。Markdownのみで出力してください。",
        "冒頭は見出しなしの箇条書き3つ、その後は ### 補足 と ### 気になる点 だけを使ってください。",
        "AI比較やモデル評価は書かず、不確かな点は ### 気になる点 に入れてください。"
      ].join("\n"),
      userPrompt: [
        "次を要約してください。",
        "",
        "## 質問",
        compactQuestion,
        "",
        "## 各AI回答",
        answerBlocks
      ].join("\n")
    };
  }

  function buildDigestDiagnosticPrompt() {
    return buildDigestPrompt(
      "MirrorChat の digest 診断です。各回答の要点を短く整理してください。",
      [
        { name: "ChatGPT", markdown: "- 要点A\n- 補足B", error: "" },
        { name: "Claude", markdown: "- 観点C\n- 気になる点D", error: "" }
      ]
    );
  }

  function limitAttemptCandidates(candidates, attemptLimit) {
    const normalized = Array.isArray(candidates) ? candidates.slice() : [];
    if (!Number.isFinite(attemptLimit) || attemptLimit <= 0) {
      return normalized;
    }
    return normalized.slice(0, Math.floor(attemptLimit));
  }

  function toErrorText(error) {
    return error instanceof Error ? error.message : String(error || "Unknown error");
  }

  async function emitProgress(onProgress, payload) {
    if (typeof onProgress !== "function") return;
    await onProgress(payload);
  }

  function buildRunContext({ prompt, settings, preferredModel, requestedModel, apiKey, timeoutMs, catalogTimeoutMs, attemptLimit }) {
    const resolvedApiKey = String(apiKey || settings?.openrouter?.apiKey || "").trim();
    const resolvedPreferredModel = String(preferredModel || settings?.openrouter?.preferredModel || "").trim();
    const resolvedRequestedModel = String(requestedModel || "").trim();
    return {
      resolvedApiKey,
      resolvedPreferredModel,
      resolvedRequestedModel,
      systemPrompt: String(prompt?.systemPrompt || ""),
      userPrompt: String(prompt?.userPrompt || ""),
      candidateResolution: {
        source: resolvedRequestedModel ? "requested" : "stored",
        preferredModel: resolvedPreferredModel,
        requestedModel: resolvedRequestedModel,
        attemptedCandidates: [],
        runtime: {
          timeoutMs,
          catalogTimeoutMs,
          attemptLimit: Number.isFinite(attemptLimit) && attemptLimit > 0 ? Math.floor(attemptLimit) : null
        },
        catalogError: null
      }
    };
  }

  async function resolveRunCandidates({
    settings,
    fetchImpl,
    onProgress,
    resolvedApiKey,
    resolvedPreferredModel,
    resolvedRequestedModel,
    catalogTimeoutMs,
    candidateResolution
  }) {
    let resolvedCandidates = settings?.openrouter?.freeModelCandidatesOverride;
    let refreshedCandidates = [];
    let refreshedStats = {};

    if (resolvedRequestedModel) {
      return {
        resolvedCandidates: [resolvedRequestedModel],
        refreshedCandidates,
        refreshedStats
      };
    }

    try {
      await emitProgress(onProgress, {
        stage: "catalog-start",
        message: "digest の free候補を確認しています..."
      });

      const catalog = await openRouterClient.fetchModelsCatalog({
        apiKey: resolvedApiKey,
        fetchImpl,
        timeoutMs: catalogTimeoutMs
      });
      const refreshed = freeModelSelector.refreshDigestFreeModels({
        catalog,
        preferredModel: resolvedPreferredModel
      });
      resolvedCandidates = refreshed.candidates;
      refreshedCandidates = refreshed.candidates;
      refreshedStats = refreshed.stats || {};
      candidateResolution.source = "catalog";
      return { resolvedCandidates, refreshedCandidates, refreshedStats };
    } catch (error) {
      const kind = freeModelSelector.classifyOpenRouterError(error);
      const errorText = toErrorText(error);
      candidateResolution.source = "stored";
      candidateResolution.catalogError = {
        kind,
        error: errorText,
        errorMessage: summarizeCatalogError({ kind, message: errorText })
      };
      await emitProgress(onProgress, {
        stage: "catalog-failure",
        kind,
        error: errorText,
        message: "free候補の取得に失敗したため、保存済み候補で digest を続行します。",
        errorMessage: candidateResolution.catalogError.errorMessage
      });
      return { resolvedCandidates, refreshedCandidates, refreshedStats };
    }
  }

  async function runDigestPrompt({
    prompt,
    settings,
    fetchImpl,
    onProgress,
    preferredModel,
    requestedModel,
    apiKey,
    timeoutMs = DIGEST_MODEL_TIMEOUT_MS,
    catalogTimeoutMs = DIGEST_CATALOG_TIMEOUT_MS,
    attemptLimit = 0
  }) {
    const context = buildRunContext({
      prompt,
      settings,
      preferredModel,
      requestedModel,
      apiKey,
      timeoutMs,
      catalogTimeoutMs,
      attemptLimit
    });
    const {
      resolvedApiKey,
      resolvedPreferredModel,
      resolvedRequestedModel,
      systemPrompt,
      userPrompt,
      candidateResolution
    } = context;

    if (!resolvedApiKey) {
      return {
        ok: false,
        error: "OpenRouter API キーが設定されていません",
        attempts: [],
        attemptResults: [],
        refreshedCandidates: [],
        refreshedStats: {},
        candidateResolution
      };
    }

    const {
      resolvedCandidates,
      refreshedCandidates,
      refreshedStats
    } = await resolveRunCandidates({
      settings,
      fetchImpl,
      onProgress,
      resolvedApiKey,
      resolvedPreferredModel,
      resolvedRequestedModel,
      catalogTimeoutMs,
      candidateResolution
    });

    const orderedCandidates = resolvedRequestedModel
      ? [resolvedRequestedModel]
      : freeModelSelector.buildCandidateList({
          preferredModel: resolvedPreferredModel,
          candidates: resolvedCandidates
        });
    const attemptCandidates = limitAttemptCandidates(orderedCandidates, attemptLimit);
    candidateResolution.attemptedCandidates = attemptCandidates.slice();

    const attempts = [];
    const attemptResults = [];
    let lastError = "";

    for (const modelId of attemptCandidates) {
      const previousFailure = Array.isArray(attempts) && attempts.length > 0 ? attempts[attempts.length - 1] : null;
      await emitProgress(onProgress, {
        stage: "attempt-start",
        modelId,
        message: `digest を生成しています... (${modelId})`,
        errorMessage: previousFailure
          ? summarizeAttemptError({
              modelId: previousFailure.modelId,
              kind: previousFailure.kind,
              message: previousFailure.error
            })
          : ""
      });

      const diagnostic = await openRouterClient.diagnoseChatCompletion({
        apiKey: resolvedApiKey,
        modelId,
        systemPrompt,
        userPrompt,
        timeoutMs,
        fetchImpl
      });

      if (diagnostic.ok) {
        attemptResults.push({
          ok: true,
          modelId,
          kind: "success",
          error: "",
          diagnostic
        });
        return {
          ok: true,
          text: diagnostic.text,
          modelId,
          attempts,
          attemptResults,
          refreshedCandidates,
          refreshedStats,
          candidateResolution
        };
      }

      const failure = {
        modelId,
        kind: freeModelSelector.classifyOpenRouterError(new Error(diagnostic.error || "OpenRouter request failed")),
        error: diagnostic.error || "OpenRouter request failed"
      };
      attempts.push(failure);
      attemptResults.push({
        ok: false,
        modelId,
        kind: failure.kind,
        error: failure.error,
        diagnostic
      });
      await emitProgress(onProgress, {
        stage: "attempt-failure",
        modelId,
        kind: failure.kind,
        error: failure.error,
        message: `digest を生成しています... (${modelId})`,
        errorMessage: summarizeAttemptError({ modelId, kind: failure.kind, message: failure.error })
      });
      lastError = failure.error;
    }

    return {
      ok: false,
      error: lastError || "No working OpenRouter free models",
      attempts,
      attemptResults,
      refreshedCandidates,
      refreshedStats,
      candidateResolution
    };
  }

  async function generateDigest({ question, results, settings, fetchImpl, onProgress }) {
    const prompt = buildDigestPrompt(question, results);
    const selection = await runDigestPrompt({
      prompt,
      settings,
      fetchImpl,
      onProgress
    });

    if (!selection.ok) {
      return {
        ok: false,
        error: selection.error,
        attempts: selection.attempts
      };
    }

    return {
      ok: true,
      digest: buildDigestBody({
        digestMarkdown: selection.text,
        modelId: selection.modelId
      }),
      modelId: selection.modelId,
      attempts: selection.attempts,
      refreshedCandidates: selection.refreshedCandidates,
      refreshedStats: selection.refreshedStats
    };
  }

  self.MirrorChatDigestService = {
    isDigestEnabled,
    buildDigestFailureText,
    buildDigestBody,
    buildDigestPrompt,
    buildDigestDiagnosticPrompt,
    runDigestPrompt,
    generateDigest
  };
})();