/**
 * Obsidian 保存・エクスポート共通の Markdown 組み立て
 */
(function () {
  const DIGEST_PENDING_TEXT = "生成中...";
  const DIGEST_DISABLED_TEXT = "未生成";

  function isObsidianConfigured(settings) {
    return !!String(settings?.obsidian?.baseUrl || "").trim();
  }

  function buildAnswerSections(results) {
    const parts = [];
    for (const { name, markdown } of results) {
      parts.push(`### ${name}\n\n${markdown || "(取得できませんでした)"}`);
    }
    return parts.join("\n\n---\n\n");
  }

  function buildInitialDigestText(settings) {
    return settings?.digestProvider || settings?.openrouter?.enableDigest
      ? DIGEST_PENDING_TEXT
      : DIGEST_DISABLED_TEXT;
  }

  function buildQuestionAnswersContent(question, results, settings) {
    return [
      "## 質問",
      "",
      question,
      "",
      "---",
      "",
      "## まとめ",
      "",
      buildInitialDigestText(settings),
      "",
      "---",
      "",
      "## 各AI回答",
      "",
      buildAnswerSections(results)
    ].join("\n");
  }

  function replaceDigestSection(content, digestText) {
    const legacyStartMarker = "<!-- MIRRORCHAT_DIGEST_START -->\n";
    const legacyEndMarker = "\n<!-- MIRRORCHAT_DIGEST_END -->";
    const legacyStart = content.indexOf(legacyStartMarker);
    const legacyEnd = content.indexOf(legacyEndMarker, legacyStart);
    if (legacyStart !== -1 && legacyEnd !== -1 && legacyEnd >= legacyStart) {
      return {
        ok: true,
        content: `${content.slice(0, legacyStart)}${digestText}${content.slice(legacyEnd + legacyEndMarker.length)}`
      };
    }

    const startMarker = "## まとめ\n\n";
    const fallbackStart = content.indexOf(startMarker);
    if (fallbackStart === -1) {
      return {
        ok: false,
        error: "まとめセクションが見つかりませんでした"
      };
    }

    const digestStart = fallbackStart + startMarker.length;
    const nextSection = content.indexOf("\n\n---\n\n## 各AI回答", digestStart);
    const digestEnd = nextSection === -1 ? content.length : nextSection;
    return {
      ok: true,
      content: `${content.slice(0, digestStart)}${digestText}${content.slice(digestEnd)}`
    };
  }

  self.MirrorChatNoteContentBuilder = {
    isObsidianConfigured,
    buildAnswerSections,
    buildInitialDigestText,
    buildQuestionAnswersContent,
    replaceDigestSection
  };
})();
