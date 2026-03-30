(function () {
  const { STORAGE_KEYS } = self.MirrorChatConstants;
  const FOLDER_SEQ_KEY = STORAGE_KEYS.FOLDER_SEQ;
  const LAST_SAVED_FOLDER_KEY = STORAGE_KEYS.LAST_SAVED_FOLDER;
  const QUESTION_FILE_SEQ_KEY = STORAGE_KEYS.QUESTION_FILE_SEQ;

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

  function buildQuestionAnswersContent(question, results) {
    return `## 質問\n\n${question}\n\n---\n\n${buildAnswerSections(results)}`;
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
    const content = buildQuestionAnswersContent(question, results);
    const res = await self.ObsidianClient.createNote(baseUrl, token, `${basePath}/${fileName}`, content);
    if (!res.ok) {
      return { ok: false, error: res.error, payload: { question, results, basePath } };
    }

    await new Promise((resolve) =>
      chrome.storage.local.set({ [LAST_SAVED_FOLDER_KEY]: basePath }, resolve)
    );
    return { ok: true };
  }

  async function appendToObsidian(basePath, question, results, settings) {
    const { baseUrl, token } = settings.obsidian || {};

    if (!baseUrl) {
      return { ok: false, error: "ObsidianのベースURLが設定されていません" };
    }

    const questionSeq = await getNextQuestionFileSeq(basePath);
    const fileName = getQuestionFileName(question, questionSeq);
    const content = buildQuestionAnswersContent(question, results);
    const res = await self.ObsidianClient.createNote(baseUrl, token, `${basePath}/${fileName}`, content);
    if (!res.ok) {
      return { ok: false, error: res.error };
    }

    return { ok: true };
  }

  self.MirrorChatObsidianStorage = {
    saveToObsidian,
    appendToObsidian
  };
})();