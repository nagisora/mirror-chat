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

  async function generateDigest({ question, results, settings, fetchImpl, onProgress }) {
    const apiKey = String(settings?.openrouter?.apiKey || "").trim();
    if (!apiKey) {
      return { ok: false, error: "OpenRouter API キーが設定されていません", attempts: [] };
    }

    let resolvedCandidates = settings?.openrouter?.freeModelCandidatesOverride;
    let refreshedCandidates = [];
    try {
      if (typeof onProgress === "function") {
        await onProgress({
          stage: "catalog-start",
          message: "digest の free候補を確認しています..."
        });
      }

      const catalog = await openRouterClient.fetchModelsCatalog({
        apiKey,
        fetchImpl,
        timeoutMs: DIGEST_CATALOG_TIMEOUT_MS
      });
      const refreshed = freeModelSelector.refreshDigestFreeModels({
        catalog,
        preferredModel: settings?.openrouter?.preferredModel
      });
      resolvedCandidates = refreshed.candidates;
      refreshedCandidates = refreshed.candidates;
    } catch (error) {
      const kind = freeModelSelector.classifyOpenRouterError(error);
      if (typeof onProgress === "function") {
        await onProgress({
          stage: "catalog-failure",
          kind,
          error: error instanceof Error ? error.message : String(error || "Unknown error"),
          message: "free候補の取得に失敗したため、保存済み候補で digest を続行します。",
          errorMessage: summarizeCatalogError({
            kind,
            message: error instanceof Error ? error.message : String(error || "Unknown error")
          })
        });
      }
      // catalog refresh failure should not block digest generation; fall back to stored/default candidates
    }

    const prompt = buildDigestPrompt(question, results);
    const selection = await freeModelSelector.tryCandidates({
      preferredModel: settings?.openrouter?.preferredModel,
      candidates: resolvedCandidates,
      onAttemptStart: async ({ modelId, attempts }) => {
        const previousFailure = Array.isArray(attempts) && attempts.length > 0 ? attempts[attempts.length - 1] : null;
        if (typeof onProgress === "function") {
          await onProgress({
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
        }
      },
      onAttemptFailure: async ({ modelId, kind, error }) => {
        if (typeof onProgress === "function") {
          await onProgress({
            stage: "attempt-failure",
            modelId,
            kind,
            error,
            message: `digest を生成しています... (${modelId})`,
            errorMessage: summarizeAttemptError({ modelId, kind, message: error })
          });
        }
      },
      attempt: async (modelId) =>
        openRouterClient.requestChatCompletion({
          apiKey,
          modelId,
          systemPrompt: prompt.systemPrompt,
          userPrompt: prompt.userPrompt,
          timeoutMs: DIGEST_MODEL_TIMEOUT_MS,
          fetchImpl
        })
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
        digestMarkdown: selection.value,
        modelId: selection.modelId
      }),
      modelId: selection.modelId,
      attempts: selection.attempts,
      refreshedCandidates
    };
  }

  self.MirrorChatDigestService = {
    isDigestEnabled,
    buildDigestFailureText,
    buildDigestBody,
    buildDigestPrompt,
    generateDigest
  };
})();