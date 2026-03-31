(function () {
  const { STORAGE_KEYS } = self.MirrorChatConstants;
  const FOLDER_SEQ_KEY = STORAGE_KEYS.FOLDER_SEQ;
  const LAST_SAVED_FOLDER_KEY = STORAGE_KEYS.LAST_SAVED_FOLDER;
  const QUESTION_FILE_SEQ_KEY = STORAGE_KEYS.QUESTION_FILE_SEQ;
  const DIGEST_PENDING_TEXT = "生成中...";
  const DIGEST_DISABLED_TEXT = "未生成";

  function getQuestionExcerpt(text) {
    const cleaned = String(text)
      .replace(/[\r\n]/g, " ")
      .replace(/[/\\?*:"<>|.]/g, "");
    return Array.from(cleaned.trim())
      .slice(0, 20)
      .join("") || "q";
  }

  async function getNextFolderSeq() {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const stored = await new Promise((resolve) =>
      chrome.storage.local.get(FOLDER_SEQ_KEY, (x) => resolve(x[FOLDER_SEQ_KEY] || {}))
    );
    if (stored.lastDate !== today) {
      stored.lastDate = today;
      stored.seq = 0;
    }
    stored.seq = (stored.seq || 0) + 1;
    await new Promise((resolve) =>
      chrome.storage.local.set({ [FOLDER_SEQ_KEY]: stored }, resolve)
    );
    return stored.seq;
  }

  async function getObsidianFolderName(question) {
    const safe = getQuestionExcerpt(question);
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const seq = await getNextFolderSeq();
    const seqStr = String(seq).padStart(2, "0");
    return `${date}-${seqStr}-${safe}`;
  }

  async function getNextQuestionFileSeq(basePath) {
    const stored = await new Promise((resolve) =>
      chrome.storage.local.get(QUESTION_FILE_SEQ_KEY, (x) => resolve(x[QUESTION_FILE_SEQ_KEY] || {}))
    );
    stored[basePath] = (stored[basePath] || 0) + 1;
    await new Promise((resolve) =>
      chrome.storage.local.set({ [QUESTION_FILE_SEQ_KEY]: stored }, resolve)
    );
    return stored[basePath];
  }

  function getQuestionFileName(question, seq) {
    const seqStr = String(seq).padStart(2, "0");
    return `${seqStr}-${getQuestionExcerpt(question)}.md`;
  }

  function buildAnswerSections(results) {
    const parts = [];
    for (const { name, markdown } of results) {
      parts.push(`## ${name}\n\n${markdown || "(取得できませんでした)"}\n\n`);
    }
    return parts.join("---\n\n");
  }

  function buildInitialDigestText(settings) {
    return settings.openrouter?.enableDigest ? DIGEST_PENDING_TEXT : DIGEST_DISABLED_TEXT;
  }

  function buildQuestionAnswersContent(question, results, settings) {
    return [
      "## 質問",
      "",
      question,
      "",
      "## まとめ",
      "",
      buildInitialDigestText(settings),
      "",
      buildAnswerSections(results)
    ].join("\n");
  }

  function replaceDigestSection(content, digestText) {
    const startMarker = "## まとめ\n\n";
    const start = content.indexOf(startMarker);
    if (start === -1) {
      return {
        ok: false,
        error: "まとめセクションが見つかりませんでした"
      };
    }

    const digestStart = start + startMarker.length;
    const nextSection = content.indexOf("\n## ", digestStart);
    const digestEnd = nextSection === -1 ? content.length : nextSection;
    return {
      ok: true,
      content: `${content.slice(0, digestStart)}${digestText}${content.slice(digestEnd)}`
    };
  }

  async function saveToObsidian(question, results, settings) {
    const root = (settings.obsidian?.rootPath || "AI-Research").replace(/\/$/, "");
    const folder = await getObsidianFolderName(question);
    const basePath = `${root}/${folder}`;
    const { baseUrl, token } = settings.obsidian || {};

    if (!baseUrl) {
      return { ok: false, error: "ObsidianのベースURLが設定されていません" };
    }

    const questionSeq = await getNextQuestionFileSeq(basePath);
    const fileName = getQuestionFileName(question, questionSeq);
    const notePath = `${basePath}/${fileName}`;
    const content = buildQuestionAnswersContent(question, results, settings);
    const res = await self.ObsidianClient.createNote(baseUrl, token, notePath, content);
    if (!res.ok) {
      return { ok: false, error: res.error, payload: { question, results, basePath } };
    }

    await new Promise((resolve) =>
      chrome.storage.local.set({ [LAST_SAVED_FOLDER_KEY]: basePath }, resolve)
    );
    return { ok: true, basePath, fileName, notePath };
  }

  async function appendToObsidian(basePath, question, results, settings) {
    const { baseUrl, token } = settings.obsidian || {};

    if (!baseUrl) {
      return { ok: false, error: "ObsidianのベースURLが設定されていません" };
    }

    const questionSeq = await getNextQuestionFileSeq(basePath);
    const fileName = getQuestionFileName(question, questionSeq);
    const notePath = `${basePath}/${fileName}`;
    const content = buildQuestionAnswersContent(question, results, settings);
    const res = await self.ObsidianClient.createNote(baseUrl, token, notePath, content);
    if (!res.ok) {
      return { ok: false, error: res.error };
    }

    return { ok: true, basePath, fileName, notePath };
  }

  async function updateDigestInObsidian(notePath, digestText, settings) {
    const { baseUrl, token } = settings.obsidian || {};

    if (!baseUrl) {
      return { ok: false, error: "ObsidianのベースURLが設定されていません" };
    }

    const getRes = await self.ObsidianClient.getNote(baseUrl, token, notePath);
    if (!getRes.ok) {
      return { ok: false, error: getRes.error };
    }

    const replaced = replaceDigestSection(getRes.content || "", digestText);
    if (!replaced.ok) {
      return { ok: false, error: replaced.error };
    }

    const saveRes = await self.ObsidianClient.createNote(baseUrl, token, notePath, replaced.content);
    if (!saveRes.ok) {
      return { ok: false, error: saveRes.error };
    }

    return { ok: true };
  }

  self.MirrorChatObsidianStorage = {
    saveToObsidian,
    appendToObsidian,
    updateDigestInObsidian,
    replaceDigestSection
  };
})();