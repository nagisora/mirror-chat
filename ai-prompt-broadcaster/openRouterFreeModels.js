(function () {
  const DEFAULT_MIN_PARAM_B = 27;
  const DEFAULT_MAX_AGE_DAYS = 180;
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

  function buildSelectOptions({ preferredModel, candidates } = {}) {
    const ordered = buildCandidateList({ preferredModel, candidates });
    const options = [{ value: "", label: "自動選択（最新の free 候補から選ぶ）" }];
    for (const modelId of ordered) {
      options.push({ value: modelId, label: modelId });
    }
    return options;
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

  function inferParamBFromText(text) {
    const raw = String(text || "");
    const match = raw.match(/(?:^|[^a-z0-9])(\d+(?:\.\d+)?)b(?:[^a-z0-9]|$)/i);
    if (match) return Number(match[1]);
    const eMatch = raw.match(/(?:^|[^a-z0-9])e(\d+(?:\.\d+)?)b(?:[^a-z0-9]|$)/i);
    if (eMatch) return Number(eMatch[1]);
    return null;
  }

  function toModelEntry(entry) {
    if (!entry || typeof entry !== "object") return null;
    const obj = entry;
    const id = typeof obj.id === "string" ? obj.id.trim() : "";
    if (!id) return null;
    const name = typeof obj.name === "string" ? obj.name.trim() : "";
    const createdAtMs = typeof obj.created === "number" && Number.isFinite(obj.created) && obj.created > 0
      ? Math.round(obj.created * 1000)
      : null;
    return {
      id,
      name,
      createdAtMs,
      inferredParamB: inferParamBFromText(`${id} ${name}`)
    };
  }

  function refreshDigestFreeModels({
    catalog,
    preferredModel,
    minParamB = DEFAULT_MIN_PARAM_B,
    maxAgeDays = DEFAULT_MAX_AGE_DAYS
  } = {}) {
    const now = Date.now();
    const maxAgeMs = maxAgeDays > 0 ? maxAgeDays * 24 * 60 * 60 * 1000 : 0;
    const entries = (Array.isArray(catalog) ? catalog : [])
      .map(toModelEntry)
      .filter((entry) => Boolean(entry));

    const freeModels = entries.filter((entry) => entry.id.endsWith(":free"));
    const ageFiltered = freeModels.filter((entry) => {
      if (maxAgeMs <= 0) return true;
      if (entry.createdAtMs === null) return false;
      const age = now - entry.createdAtMs;
      return age >= 0 && age <= maxAgeMs;
    });
    const sizeFiltered = ageFiltered.filter((entry) => {
      if (entry.inferredParamB === null) return true;
      return entry.inferredParamB >= minParamB;
    });

    const sorted = sizeFiltered.slice().sort((a, b) => {
      const aCreated = a.createdAtMs ?? -1;
      const bCreated = b.createdAtMs ?? -1;
      if (aCreated !== bCreated) return bCreated - aCreated;
      const aSize = a.inferredParamB ?? -1;
      const bSize = b.inferredParamB ?? -1;
      if (aSize !== bSize) return bSize - aSize;
      return a.id.localeCompare(b.id);
    });

    const refreshedCandidates = sorted.map((entry) => entry.id);
    return {
      candidates: buildCandidateList({ preferredModel, candidates: refreshedCandidates }),
      stats: {
        catalogCount: entries.length,
        freeCount: freeModels.length,
        ageFilteredCount: ageFiltered.length,
        finalCount: sorted.length,
        minParamB,
        maxAgeDays
      }
    };
  }

  async function tryCandidates({ preferredModel, candidates, attempt, onAttemptStart, onAttemptFailure }) {
    const orderedCandidates = buildCandidateList({ preferredModel, candidates });
    const attempts = [];
    let lastError = null;

    for (const modelId of orderedCandidates) {
      try {
        if (typeof onAttemptStart === "function") {
          await onAttemptStart({ modelId, attempts: attempts.slice() });
        }
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
        const failure = {
          modelId,
          kind: classifyOpenRouterError(error),
          error: message
        };
        attempts.push(failure);
        if (typeof onAttemptFailure === "function") {
          await onAttemptFailure({ ...failure, attempts: attempts.slice() });
        }
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
    buildSelectOptions,
    classifyOpenRouterError,
    refreshDigestFreeModels,
    tryCandidates
  };
})();