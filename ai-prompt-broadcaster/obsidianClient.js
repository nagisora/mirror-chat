/**
 * Obsidian Local REST API クライアント
 * ノート作成・URL組み立て・認証・リトライを1か所で扱う
 */
(function () {
  const MAX_RETRIES = 2;
  const RETRY_DELAY_BASE_MS = 500;

  async function createNote(baseUrl, token, path, content) {
    const url = `${baseUrl.replace(/\/$/, "")}/vault/${path.replace(/^\//, "")}`;
    const headers = {
      "Content-Type": "text/markdown"
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

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

  if (typeof self !== "undefined") {
    self.ObsidianClient = { createNote };
  }
})();
