(function () {
  const openRouterClient = self.MirrorChatOpenRouterClient;
  const freeModelSelector = self.MirrorChatOpenRouterFreeModels;

  function isDigestEnabled(settings) {
    return !!settings?.openrouter?.enableDigest;
  }

  function buildDigestFailureText(message) {
    return `生成に失敗しました。\n\n${String(message || "Unknown error")}`;
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

    const prompt = buildDigestPrompt(question, results);
    const selection = await freeModelSelector.tryCandidates({
      preferredModel: settings?.openrouter?.preferredModel,
      candidates: settings?.openrouter?.freeModelCandidatesOverride,
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
      digest: selection.value,
      modelId: selection.modelId,
      attempts: selection.attempts
    };
  }

  self.MirrorChatDigestService = {
    isDigestEnabled,
    buildDigestFailureText,
    buildDigestPrompt,
    generateDigest
  };
})();