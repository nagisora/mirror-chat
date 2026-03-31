(function () {
  const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
  const DEFAULT_TIMEOUT_MS = 30000;

  async function requestJson({ url, apiKey, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS }) {
    const controller = new AbortController();
    const timerId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers = { Accept: "application/json" };
      if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
      }
      const response = await fetchImpl(url, {
        method: "GET",
        headers,
        signal: controller.signal
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter HTTP ${response.status}: ${errorText || response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error(`OpenRouter request timed out after ${timeoutMs}ms`, { cause: error });
      }
      throw error;
    } finally {
      clearTimeout(timerId);
    }
  }

  function extractTextFromMessageContent(content) {
    if (typeof content === "string") return content.trim();
    if (!Array.isArray(content)) return "";
    return content
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        if (typeof part.text === "string") return part.text;
        return "";
      })
      .join("\n")
      .trim();
  }

  async function requestChatCompletion({
    apiKey,
    modelId,
    systemPrompt,
    userPrompt,
    fetchImpl = fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    baseUrl = DEFAULT_BASE_URL
  }) {
    const controller = new AbortController();
    const timerId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          model: modelId,
          temperature: 0.2,
          max_tokens: 700,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ]
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter HTTP ${response.status}: ${errorText || response.statusText}`);
      }

      const payload = await response.json();
      const text = extractTextFromMessageContent(payload?.choices?.[0]?.message?.content);
      if (!text) {
        throw new Error("OpenRouter returned an empty completion");
      }
      return text;
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error(`OpenRouter request timed out after ${timeoutMs}ms`, { cause: error });
      }
      throw error;
    } finally {
      clearTimeout(timerId);
    }
  }

  async function fetchModelsCatalog({
    apiKey,
    fetchImpl = fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    baseUrl = DEFAULT_BASE_URL
  }) {
    const payload = await requestJson({
      url: `${baseUrl}/models`,
      apiKey,
      fetchImpl,
      timeoutMs
    });
    return Array.isArray(payload?.data) ? payload.data : [];
  }

  self.MirrorChatOpenRouterClient = {
    requestChatCompletion,
    fetchModelsCatalog
  };
})();