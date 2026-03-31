(function () {
  const openRouterClient = self.MirrorChatOpenRouterClient;
  const freeModelSelector = self.MirrorChatOpenRouterFreeModels;

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
        "### 要点3行",
        "### 補足",
        "### 参考になったAI",
        "### 残課題"
      ].join("\n"),
      userPrompt: [
        "次の質問と各AI回答を要約してください。",
        "形式は読書メモ型にしてください。",
        "### 要点3行 は 3 個の箇条書きだけにしてください。",
        "### 補足 は重要な背景や補助説明を 2-4 個の箇条書きで書いてください。",
        "### 参考になったAI は、どのAIがどの観点で役立ったかを簡潔に書いてください。複数あって構いません。",
        "### 残課題 は曖昧さ、未確認事項、次に確かめるべき点を書いてください。",
        "断定しきれない内容は 残課題 に回してください。",
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