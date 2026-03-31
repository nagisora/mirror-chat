(function () {
  const DEFAULT_DIGEST_FREE_MODELS = [
    "google/gemma-3-27b-it:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "deepseek/deepseek-r1-distill-llama-70b:free",
    "qwen/qwq-32b:free"
  ];

  function normalizeCandidateList(candidates) {
    const unique = new Set();
    const normalized = [];
    for (const candidate of candidates || []) {
      const modelId = String(candidate || "").trim();
      if (!modelId || unique.has(modelId)) continue;
      unique.add(modelId);
      normalized.push(modelId);
    }
    return normalized;
  }

  function getDefaultDigestFreeModels() {
    return [...DEFAULT_DIGEST_FREE_MODELS];
  }

  function buildCandidateList({ preferredModel, candidates } = {}) {
    const base = Array.isArray(candidates) && candidates.length > 0
      ? candidates
      : getDefaultDigestFreeModels();
    const preferred = String(preferredModel || "").trim();
    return normalizeCandidateList(preferred ? [preferred, ...base] : base);
  }

  function classifyOpenRouterError(error) {
    const message = error instanceof Error ? error.message : String(error || "");
    const lower = message.toLowerCase();
    if (
      lower.includes("rate limit exceeded") ||
      lower.includes("free-models-per-min") ||
      lower.includes("free-models-per-day") ||
      lower.includes("http 429")
    ) {
      return "rateLimit";
    }
    if (lower.includes("no allowed providers are available")) {
      return "noProviders";
    }
    if (lower.includes("timed out") || lower.includes("timeout") || lower.includes("aborted")) {
      return "timeout";
    }
    return "other";
  }

  async function tryCandidates({ preferredModel, candidates, attempt }) {
    const orderedCandidates = buildCandidateList({ preferredModel, candidates });
    const attempts = [];
    let lastError = null;

    for (const modelId of orderedCandidates) {
      try {
        const value = await attempt(modelId);
        if (!String(value || "").trim()) {
          throw new Error("OpenRouter response was empty");
        }
        return {
          ok: true,
          modelId,
          value: String(value).trim(),
          attempts
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error || "Unknown error");
        attempts.push({
          modelId,
          kind: classifyOpenRouterError(error),
          error: message
        });
        lastError = error;
      }
    }

    return {
      ok: false,
      error: lastError instanceof Error ? lastError.message : String(lastError || "No working OpenRouter free models"),
      attempts
    };
  }

  self.MirrorChatOpenRouterFreeModels = {
    getDefaultDigestFreeModels,
    buildCandidateList,
    classifyOpenRouterError,
    tryCandidates
  };
})();