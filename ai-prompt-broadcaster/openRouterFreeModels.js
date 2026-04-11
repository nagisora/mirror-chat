(function () {
  const DEFAULT_MIN_PARAM_B = 27;
  const DEFAULT_MAX_AGE_DAYS = 180;
  const COLLECTION_PRIORITY_MODELS = [
    "nvidia/nemotron-3-super-120b-a12b:free",
    "arcee-ai/trinity-large-preview:free",
    "z-ai/glm-4.5-air:free",
    "nvidia/nemotron-3-nano-30b-a3b:free",
    "minimax/minimax-m2.5:free",
    "openai/gpt-oss-120b:free",
    "google/gemma-4-31b-it:free",
    "google/gemma-4-26b-a4b-it:free",
    "qwen/qwen3-coder:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "qwen/qwen3-next-80b-a3b-instruct:free",
    "openai/gpt-oss-20b:free"
  ];
  const DEFAULT_DIGEST_FREE_MODELS = [
    "qwen/qwen3-next-80b-a3b-instruct:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "google/gemma-4-31b-it:free",
    "minimax/minimax-m2.5:free"
  ];
  const COLLECTION_PRIORITY_INDEX = new Map(
    COLLECTION_PRIORITY_MODELS.map((modelId, index) => [modelId, index])
  );

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

  function getCollectionPriorityModels() {
    return [...COLLECTION_PRIORITY_MODELS];
  }

  function getCollectionPriorityIndex(modelId) {
    return COLLECTION_PRIORITY_INDEX.has(modelId)
      ? COLLECTION_PRIORITY_INDEX.get(modelId)
      : Number.POSITIVE_INFINITY;
  }

  function buildCandidateList({ preferredModel, candidates } = {}) {
    const base = Array.isArray(candidates) && candidates.length > 0
      ? candidates
      : getDefaultDigestFreeModels();
    const preferred = String(preferredModel || "").trim();
    return normalizeCandidateList(preferred ? [preferred, ...base] : base);
  }

  function buildKnownFreeModelList({ preferredModel, candidates } = {}) {
    const preferred = String(preferredModel || "").trim();
    const provided = Array.isArray(candidates) ? candidates : [];
    return normalizeCandidateList([
      preferred,
      ...provided,
      ...getCollectionPriorityModels(),
      ...getDefaultDigestFreeModels()
    ]);
  }

  function buildSelectOptions({ preferredModel, candidates } = {}) {
    const ordered = buildKnownFreeModelList({ preferredModel, candidates });
    const options = [{ value: "", label: "自動選択（最新の free 候補から選ぶ）" }];
    for (const modelId of ordered) {
      options.push({ value: modelId, label: modelId });
    }
    return options;
  }

  function summarizeModelAvailability({ preferredModel, candidates, stats, lastRefreshAt } = {}) {
    const normalizedCandidates = Array.isArray(candidates) ? normalizeCandidateList(candidates) : [];
    const normalizedStats = stats && typeof stats === "object" ? stats : {};
    const summary = {
      digestCandidateCount: buildCandidateList({
        preferredModel,
        candidates: normalizedCandidates
      }).length,
      selectableCount: buildKnownFreeModelList({
        preferredModel,
        candidates: normalizedCandidates
      }).length,
      freeCount: Number.isFinite(normalizedStats.freeCount) ? normalizedStats.freeCount : null,
      catalogCount: Number.isFinite(normalizedStats.catalogCount) ? normalizedStats.catalogCount : null,
      digestCompatibleCount: Number.isFinite(normalizedStats.digestCompatibleCount)
        ? normalizedStats.digestCompatibleCount
        : null,
      lastRefreshAt: String(lastRefreshAt || "").trim()
    };
    summary.hasRefreshInfo =
      normalizedCandidates.length > 0 ||
      !!summary.lastRefreshAt ||
      summary.freeCount !== null ||
      summary.catalogCount !== null ||
      summary.digestCompatibleCount !== null;
    return summary;
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
      inferredParamB: inferParamBFromText(`${id} ${name}`),
      collectionPriority: getCollectionPriorityIndex(id)
    };
  }

  function isDigestCompatibleModel(entry) {
    const text = `${entry?.id || ""} ${entry?.name || ""}`.toLowerCase();
    if (text.includes("embed")) return false;
    if (text.includes("vl")) return false;
    if (text.includes("vision")) return false;
    return true;
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
    const digestCompatible = freeModels.filter((entry) => isDigestCompatibleModel(entry));
    const ageFiltered = digestCompatible.filter((entry) => {
      if (maxAgeMs <= 0) return true;
      if (entry.createdAtMs === null) {
        return Number.isFinite(entry.collectionPriority);
      }
      const age = now - entry.createdAtMs;
      return age >= 0 && age <= maxAgeMs;
    });
    const sizeFiltered = ageFiltered.filter((entry) => {
      if (entry.inferredParamB === null) return true;
      return entry.inferredParamB >= minParamB;
    });

    const sorted = sizeFiltered.slice().sort((a, b) => {
      const aPriority = a.collectionPriority ?? Number.POSITIVE_INFINITY;
      const bPriority = b.collectionPriority ?? Number.POSITIVE_INFINITY;
      if (aPriority !== bPriority) return aPriority - bPriority;
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
        digestCompatibleCount: digestCompatible.length,
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
    getCollectionPriorityModels,
    getDefaultDigestFreeModels,
    buildCandidateList,
    buildKnownFreeModelList,
    buildSelectOptions,
    summarizeModelAvailability,
    classifyOpenRouterError,
    refreshDigestFreeModels,
    tryCandidates
  };
})();