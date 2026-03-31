(function () {
  const openRouterClient = self.MirrorChatOpenRouterClient;
  const freeModelSelector = self.MirrorChatOpenRouterFreeModels;

  function isDigestEnabled(settings) {
    return !!settings?.openrouter?.enableDigest;
  }

  function buildDigestFailureText(message) {
    return `生成に失敗しました。\n\n${String(message || "Unknown error")}`;
  }

  function buildDigestBody({ digestMarkdown, modelId, resultNames }) {
    return [
      `> 要約モデル: openrouter/${modelId}`,
      `> 比較対象: ${resultNames.join(" / ")}`,
      "",
      digestMarkdown
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
        "あなたは複数のAI回答を比較して、日本語で短い digest を作成する編集者です。",
        "断定しすぎず、共通点と相違点を分けて整理してください。",
        "出力は Markdown のみで、次の見出しだけを使ってください。",
        "### 共通点",
        "### 相違点",
        "### 不確実な点",
        "### 次のアクション",
        "### 結論"
      ].join("\n"),
      userPrompt: [
        "次の質問と各AI回答を要約してください。",
        "各見出しの中は 1-3 個の箇条書きで簡潔にまとめてください。",
        "根拠が薄い場合は『不確実な点』へ回してください。",
        "",
        "## 質問",
        question,
        "",
        "## 各AI回答",
        answerBlocks
      ].join("\n")
    };
  }

  async function generateDigest({ question, results, settings, fetchImpl }) {
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
      attempt: async (modelId) =>
        openRouterClient.requestChatCompletion({
          apiKey,
          modelId,
          systemPrompt: prompt.systemPrompt,
          userPrompt: prompt.userPrompt,
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
        modelId: selection.modelId,
        resultNames: results.map((result) => result.name)
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