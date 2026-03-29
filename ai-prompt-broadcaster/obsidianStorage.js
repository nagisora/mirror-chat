(function () {
  const { STORAGE_KEYS } = self.MirrorChatConstants;
  const FOLDER_SEQ_KEY = STORAGE_KEYS.FOLDER_SEQ;
  const LAST_SAVED_FOLDER_KEY = STORAGE_KEYS.LAST_SAVED_FOLDER;

  const AI_NUMBERED_FILES = {
    chatgpt: "02-01-ChatGPT.md",
    claude: "02-02-Claude.md",
    gemini: "02-03-Gemini.md",
    grok: "02-04-Grok.md"
  };

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
    const cleaned = String(question)
      .replace(/[\r\n]/g, " ")
      .replace(/[/\\?*:"<>|.]/g, "");
    const safe = Array.from(cleaned.trim())
      .slice(0, 20)
      .join("") || "q";
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const seq = await getNextFolderSeq();
    const seqStr = String(seq).padStart(2, "0");
    return `${date}-${seqStr}-${safe}`;
  }

  function getNumberedFileName(aiKey) {
    return AI_NUMBERED_FILES[aiKey] || null;
  }

  function buildSummary(results) {
    const parts = [];
    for (const { name, markdown } of results) {
      parts.push(`## ${name}\n\n${markdown || "(取得できませんでした)"}\n\n`);
    }
    return parts.join("---\n\n");
  }

  async function saveToObsidian(question, results, settings) {
    const root = (settings.obsidian?.rootPath || "AI-Research").replace(/\/$/, "");
    const folder = await getObsidianFolderName(question);
    const basePath = `${root}/${folder}`;
    const { baseUrl, token } = settings.obsidian || {};

    if (!baseUrl) {
      return { ok: false, error: "ObsidianのベースURLが設定されていません" };
    }

    const files = [
      { path: `${basePath}/01-Question.md`, content: question },
      ...results.map((r) => {
        const fname = getNumberedFileName(r.ai);
        return { path: `${basePath}/${fname || `${r.name}.md`}`, content: r.markdown || "" };
      }),
      { path: `${basePath}/03-Summary.md`, content: buildSummary(results) }
    ];

    for (const f of files) {
      const res = await self.ObsidianClient.createNote(baseUrl, token, f.path, f.content);
      if (!res.ok) {
        return { ok: false, error: res.error, payload: { question, results, basePath } };
      }
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

    const questionAppend = `---\n\n## 続きの質問\n\n${question}\n\n`;
    const resQuestion = await self.ObsidianClient.appendToNote(
      baseUrl,
      token,
      `${basePath}/01-Question.md`,
      questionAppend
    );
    if (!resQuestion.ok) {
      return { ok: false, error: resQuestion.error };
    }

    for (const r of results) {
      const fname = getNumberedFileName(r.ai) || `${r.name}.md`;
      const appendContent = `---\n\n### 続きの質問\n\n${question}\n\n### 回答\n\n${r.markdown || "(取得できませんでした)"}\n\n`;
      const res = await self.ObsidianClient.appendToNote(
        baseUrl,
        token,
        `${basePath}/${fname}`,
        appendContent
      );
      if (!res.ok) {
        return { ok: false, error: res.error };
      }
    }

    const summaryAppend = `---\n\n## 続きの質問\n\n${question}\n\n${buildSummary(results)}`;
    const resSummary = await self.ObsidianClient.appendToNote(
      baseUrl,
      token,
      `${basePath}/03-Summary.md`,
      summaryAppend
    );
    if (!resSummary.ok) {
      return { ok: false, error: resSummary.error };
    }

    return { ok: true };
  }

  self.MirrorChatObsidianStorage = {
    saveToObsidian,
    appendToObsidian
  };
})();