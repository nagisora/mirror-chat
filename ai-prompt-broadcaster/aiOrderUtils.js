(function () {
  const root = typeof self !== "undefined" ? self : window;
  const constants = root.MirrorChatConstants || {};
  const AI_KEYS = Array.isArray(constants.AI_KEYS)
    ? constants.AI_KEYS
    : ["chatgpt", "claude", "gemini", "grok"];
  const AI_DEFAULT_ORDER = Array.isArray(constants.AI_DEFAULT_ORDER)
    ? constants.AI_DEFAULT_ORDER
    : ["gemini", "chatgpt", "claude", "grok"];

  function normalizeAiOrder(rawOrder) {
    const validKeys = new Set(AI_KEYS);
    const seen = new Set();
    const ordered = [];

    if (Array.isArray(rawOrder)) {
      rawOrder.forEach((aiKey) => {
        const key = String(aiKey || "").trim();
        if (!key || !validKeys.has(key) || seen.has(key)) return;
        seen.add(key);
        ordered.push(key);
      });
    }

    AI_DEFAULT_ORDER.forEach((aiKey) => {
      if (validKeys.has(aiKey) && !seen.has(aiKey)) {
        seen.add(aiKey);
        ordered.push(aiKey);
      }
    });

    AI_KEYS.forEach((aiKey) => {
      if (!seen.has(aiKey)) {
        seen.add(aiKey);
        ordered.push(aiKey);
      }
    });

    return ordered;
  }

  function resolveEnabledAIs(rawEnabledAIs, aiOrder) {
    if (typeof rawEnabledAIs === "undefined") {
      return normalizeAiOrder(aiOrder);
    }
    if (!Array.isArray(rawEnabledAIs)) return [];

    const validKeys = new Set(AI_KEYS);
    const seen = new Set();
    const enabled = [];
    rawEnabledAIs.forEach((aiKey) => {
      const key = String(aiKey || "").trim();
      if (!key || !validKeys.has(key) || seen.has(key)) return;
      seen.add(key);
      enabled.push(key);
    });
    return enabled;
  }

  function normalizeEnabledAiMap(enabledAIs, aiOrder) {
    const ordered = normalizeAiOrder(aiOrder);
    const next = {};
    ordered.forEach((aiKey) => {
      next[aiKey] = typeof enabledAIs?.[aiKey] === "boolean" ? enabledAIs[aiKey] : true;
    });
    return next;
  }

  function getDefaultEnabledAiMap(aiOrder) {
    const ordered = normalizeAiOrder(aiOrder);
    return Object.fromEntries(ordered.map((aiKey) => [aiKey, true]));
  }

  root.MirrorChatAIOrderUtils = {
    normalizeAiOrder,
    resolveEnabledAIs,
    normalizeEnabledAiMap,
    getDefaultEnabledAiMap
  };
})();
