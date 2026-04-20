(function () {
  const DEFAULT_MAX_AGE_DAYS = 180;

  // OpenCode Zen の free モデルを優先順に定義（明示的なリスト）
  const COLLECTION_PRIORITY_MODELS = [
    "big-pickle",
    "trinity-large-preview-free",
    "minimax-m2.5-free",
    "nemotron-3-super-free"
  ];

  const DEFAULT_DIGEST_FREE_MODELS = [
    "big-pickle",
    "trinity-large-preview-free",
    "minimax-m2.5-free",
    "nemotron-3-super-free"
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
    const options = [{ value: "", label: "自動選択（既定の free モデルから選ぶ）" }];
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

  function classifyOpenCodeZenError(error) {
    const message = error instanceof Error ? error.message : String(error || "");
    const lower = message.toLowerCase();
    if (
      lower.includes("rate limit") ||
      lower.includes("429") ||
      lower.includes("too many requests")
    ) {
      return "rateLimit";
    }
    if (lower.includes("no allowed providers are available")) {
      return "noProviders";
    }
    if (lower.includes("timed out") || lower.includes("timeout") || lower.includes("aborted")) {
      return "timeout";
    }
    if (
      lower.includes("model") &&
      (lower.includes("not supported") || lower.includes("not found") || lower.includes("invalid"))
    ) {
      return "invalidModel";
    }
    return "other";
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

  function isFreeModel(entry) {
    const id = entry?.id || "";
    // 明示的な free リストに入るか、モデルID末尾が -free のもの
    if (COLLECTION_PRIORITY_INDEX.has(id)) return true;
    if (id.endsWith("-free")) return true;
    // big-pickle はリストで明示
    if (id === "big-pickle") return true;
    return false;
  }

  function refreshDigestFreeModels({
    catalog,
    preferredModel,
    maxAgeDays = DEFAULT_MAX_AGE_DAYS
  } = {}) {
    const now = Date.now();
    const maxAgeMs = maxAgeDays > 0 ? maxAgeDays * 24 * 60 * 60 * 1000 : 0;
    const entries = (Array.isArray(catalog) ? catalog : [])
      .map(toModelEntry)
      .filter((entry) => Boolean(entry));

    const freeModels = entries.filter((entry) => isFreeModel(entry));
    const digestCompatible = freeModels.filter((entry) => isDigestCompatibleModel(entry));
    const ageFiltered = digestCompatible.filter((entry) => {
      if (maxAgeMs <= 0) return true;
      if (entry.createdAtMs === null) {
        return Number.isFinite(entry.collectionPriority);
      }
      const age = now - entry.createdAtMs;
      return age >= 0 && age <= maxAgeMs;
    });

    const sorted = ageFiltered.slice().sort((a, b) => {
      const aPriority = a.collectionPriority ?? Number.POSITIVE_INFINITY;
      const bPriority = b.collectionPriority ?? Number.POSITIVE_INFINITY;
      if (aPriority !== bPriority) return aPriority - bPriority;
      const aCreated = a.createdAtMs ?? -1;
      const bCreated = b.createdAtMs ?? -1;
      if (aCreated !== bCreated) return bCreated - aCreated;
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
          throw new Error("OpenCode Zen response was empty");
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
          kind: classifyOpenCodeZenError(error),
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
      error: lastError instanceof Error ? lastError.message : String(lastError || "No working OpenCode Zen free models"),
      attempts
    };
  }

  self.MirrorChatOpenCodeZenFreeModels = {
    getCollectionPriorityModels,
    getDefaultDigestFreeModels,
    buildCandidateList,
    buildKnownFreeModelList,
    buildSelectOptions,
    summarizeModelAvailability,
    classifyOpenCodeZenError,
    refreshDigestFreeModels,
    tryCandidates
  };
})();
