(function () {
  const openRouterClient = self.MirrorChatOpenRouterClient;
  const freeModelSelector = self.MirrorChatOpenRouterFreeModels;
  const DIGEST_MODEL_TIMEOUT_MS = 15000;

  function summarizeAttemptError({ modelId, kind, message }) {
    if (kind === "timeout") {
      return `${modelId} が ${Math.round(DIGEST_MODEL_TIMEOUT_MS / 1000)} 秒以内に応答しませんでした。OpenRouter 側の応答待ちでタイムアウトしたため、別モデルへ切り替えます。`;
    }
    if (kind === "rateLimit") return `${modelId} はレート制限のため利用できません。別モデルへ切り替えます。`;
    if (kind === "noProviders") return `${modelId} は利用可能な provider がありません。別モデルへ切り替えます。`;
    return `${modelId} で失敗しました: ${String(message || "不明なエラー")}`;
  }

  function isDigestEnabled(settings) {
    return !!settings?.openrouter?.enableDigest;
  }

  function buildDigestFailureText(message) {
    return `生成に失敗しました。\n\n${String(message || "Unknown error")}`;
  }

  function buildDigestBody({ digestMarkdown, modelId }) {
    return [
      digestMarkdown,
      "",
      `<sub>要約モデル: openrouter/${modelId}</sub>`
    ].join("\n");
  }

  function buildDigestPrompt(question, results) {
    const answerBlocks = results
      .map(({ name, markdown, error }) => {
        const body = markdown && markdown.trim() ? markdown.trim() : "(取得できませんでした)";
        const errorLine = error ? `\n補足エラー: ${error}` : "";
        return `### ${name}\n${body}${errorLine}`;
      })
      .join("\n\n");

    return {
      systemPrompt: [
        "あなたは複数のAI回答を比較して、日本語で読みやすい読書メモ型の digest を作成する編集者です。",
        "専門用語を詰め込みすぎず、後から Obsidian で見返して理解しやすい形で要点を整理してください。",
        "出力は Markdown のみで、次の見出しだけを使ってください。",
        "### 補足",
        "### 気になる点"
      ].join("\n"),
      userPrompt: [
        "次の質問と各AI回答を要約してください。",
        "形式は読書メモ型にしてください。",
        "冒頭は見出しを付けず、3 個の箇条書きだけを書いてください。",
        "### 補足 は重要な背景や補助説明を 2-4 個の箇条書きで書いてください。",
        "AIごとの評価や、どのAIが参考になったかという段落は作らないでください。",
        "### 気になる点 は曖昧さ、未確認事項、次に確かめるべき点を書いてください。",
        "断定しきれない内容は 気になる点 に回してください。",
        "",
        "## 質問",
        question,
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
      const catalog = await openRouterClient.fetchModelsCatalog({ apiKey, fetchImpl });
      const refreshed = freeModelSelector.refreshDigestFreeModels({
        catalog,
        preferredModel: settings?.openrouter?.preferredModel
      });
      resolvedCandidates = refreshed.candidates;
      refreshedCandidates = refreshed.candidates;
    } catch {
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