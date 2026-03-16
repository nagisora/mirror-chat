/**
 * Obsidian Local REST API クライアント
 * ノート作成・読み取り・追記・URL組み立て・認証・リトライを1か所で扱う
 */
(function () {
  const MAX_RETRIES = 2;
  const RETRY_DELAY_BASE_MS = 500;

  function buildHeaders(token, contentType) {
    const headers = {};
    if (contentType) headers["Content-Type"] = contentType;
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return headers;
  }

  function buildUrl(baseUrl, path) {
    return `${baseUrl.replace(/\/$/, "")}/vault/${path.replace(/^\//, "")}`;
  }

  async function createNote(baseUrl, token, path, content) {
    const url = buildUrl(baseUrl, path);
    const headers = buildHeaders(token, "text/markdown");

    let lastError;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(url, {
          method: "PUT",
          headers,
          body: content
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        return { ok: true };
      } catch (err) {
        lastError = err;
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_BASE_MS * (attempt + 1)));
        }
      }
    }
    return { ok: false, error: lastError?.message || String(lastError) };
  }

  /**
   * 既存ノートの内容を取得する（続きの質問用）
   */
  async function getNote(baseUrl, token, path) {
    const url = buildUrl(baseUrl, path);
    const headers = buildHeaders(token);

    let lastError;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(url, {
          method: "GET",
          headers
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        const text = await res.text();
        return { ok: true, content: text };
      } catch (err) {
        lastError = err;
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_BASE_MS * (attempt + 1)));
        }
      }
    }
    return { ok: false, error: lastError?.message || String(lastError) };
  }

  /**
   * 既存ノートに追記する（続きの質問用）。ファイルが存在しない場合は新規作成する。
   */
  async function appendToNote(baseUrl, token, path, appendContent) {
    const getRes = await getNote(baseUrl, token, path);
    const existing = getRes.ok ? getRes.content : "";
    const newContent = existing ? `${existing}\n\n${appendContent}` : appendContent;
    return createNote(baseUrl, token, path, newContent);
  }

  if (typeof self !== "undefined") {
    self.ObsidianClient = { createNote, getNote, appendToNote };
  }
})();
