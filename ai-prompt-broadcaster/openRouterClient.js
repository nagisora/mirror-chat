(function () {
  const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
  const DEFAULT_TIMEOUT_MS = 30000;
  const DEFAULT_MAX_TOKENS = 700;
  const DEFAULT_TEMPERATURE = 0.2;

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

  function buildChatCompletionRequestBody({ modelId, systemPrompt, userPrompt }) {
    return {
      model: modelId,
      temperature: DEFAULT_TEMPERATURE,
      max_tokens: DEFAULT_MAX_TOKENS,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    };
  }

  function analyzeChatCompletionPayload(payload) {
    const choice = payload?.choices?.[0];
    const topLevelErrorMessage = typeof payload?.error?.message === "string"
      ? payload.error.message.trim()
      : "";
    const rawContent = choice?.message?.content;
    const contentKind = Array.isArray(rawContent)
      ? "array"
      : rawContent === null
        ? "null"
        : typeof rawContent;
    const text = extractTextFromMessageContent(rawContent);
    const finishReason = typeof choice?.finish_reason === "string" ? choice.finish_reason.trim() : "";
    const choiceErrorMessage = typeof choice?.error?.message === "string"
      ? choice.error.message.trim()
      : "";
    const reasoning = typeof choice?.message?.reasoning === "string"
      ? choice.message.reasoning.trim()
      : "";
    const reasoningTokensRaw = payload?.usage?.completion_tokens_details?.reasoning_tokens;
    const reasoningTokens = typeof reasoningTokensRaw === "number" && Number.isFinite(reasoningTokensRaw)
      ? reasoningTokensRaw
      : null;
    const finishReasonSuffix = finishReason ? ` (finish_reason: ${finishReason})` : "";

    let error = "";
    if (!choice) {
      error = topLevelErrorMessage
        ? `OpenRouter returned an error payload: ${topLevelErrorMessage}`
        : "OpenRouter returned no completion choices";
    } else if (choiceErrorMessage) {
      error = `OpenRouter provider error: ${choiceErrorMessage}`;
    } else if (!text && reasoning) {
      error = `OpenRouter returned reasoning without final text${finishReasonSuffix}`;
    } else if (!text && reasoningTokens !== null && reasoningTokens > 0) {
      error = `OpenRouter returned no final text after consuming ${reasoningTokens} reasoning tokens${finishReasonSuffix}`;
    } else if (!text) {
      error = `OpenRouter returned an empty completion${finishReasonSuffix}`;
    }

    return {
      ok: Boolean(text) && !error,
      error,
      text,
      contentKind,
      finishReason,
      choiceErrorMessage,
      topLevelErrorMessage,
      reasoning,
      reasoningTokens,
      model: typeof payload?.model === "string" ? payload.model : "",
      provider: typeof payload?.provider === "string" ? payload.provider : "",
      usage: payload?.usage && typeof payload.usage === "object" ? payload.usage : null
    };
  }

  async function diagnoseChatCompletion({
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
    const requestBody = buildChatCompletionRequestBody({ modelId, systemPrompt, userPrompt });
    const request = {
      modelId,
      timeoutMs,
      maxTokens: requestBody.max_tokens,
      temperature: requestBody.temperature,
      systemPromptLength: String(systemPrompt || "").length,
      userPromptLength: String(userPrompt || "").length
    };

    try {
      const response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
      const responseSummary = {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText || ""
      };

      const rawText = await response.text();
      if (!response.ok) {
        return {
          ok: false,
          error: `OpenRouter HTTP ${response.status}: ${rawText || response.statusText}`,
          text: "",
          payload: null,
          rawText,
          analysis: null,
          request,
          response: responseSummary
        };
      }

      let payload = null;
      try {
        payload = rawText ? JSON.parse(rawText) : null;
      } catch (error) {
        return {
          ok: false,
          error: `OpenRouter returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
          text: "",
          payload: null,
          rawText,
          analysis: null,
          request,
          response: responseSummary
        };
      }

      const analysis = analyzeChatCompletionPayload(payload);
      return {
        ok: analysis.ok,
        error: analysis.error,
        text: analysis.text,
        payload,
        rawText,
        analysis,
        request,
        response: responseSummary
      };
    } catch (error) {
      const message = error?.name === "AbortError"
        ? `OpenRouter request timed out after ${timeoutMs}ms`
        : error instanceof Error
          ? error.message
          : String(error);
      return {
        ok: false,
        error: message,
        text: "",
        payload: null,
        rawText: "",
        analysis: null,
        request,
        response: null
      };
    } finally {
      clearTimeout(timerId);
    }
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
    const diagnostic = await diagnoseChatCompletion({
      apiKey,
      modelId,
      systemPrompt,
      userPrompt,
      fetchImpl,
      timeoutMs,
      baseUrl
    });
    if (!diagnostic.ok) {
      throw new Error(diagnostic.error || "OpenRouter request failed");
    }
    return diagnostic.text;
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
    diagnoseChatCompletion,
    requestChatCompletion,
    fetchModelsCatalog
  };
})();