(function () {
  const { STORAGE_KEYS } = self.MirrorChatConstants;
  const SNAPSHOT_HISTORY_KEY = STORAGE_KEYS.SNAPSHOT_HISTORY;
  const LAST_NOTE_SNAPSHOT_KEY = STORAGE_KEYS.LAST_NOTE_SNAPSHOT;
  const MAX_SNAPSHOTS = 40;

  function createSnapshotId() {
    return `snap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function normalizeEntry(snapshot, existingId) {
    const savedAt = snapshot?.savedAt || Date.now();
    return {
      ...snapshot,
      id: existingId || snapshot?.id || createSnapshotId(),
      savedAt
    };
  }

  async function readRawHistory() {
    const data = await new Promise((resolve) => {
      chrome.storage.local.get(SNAPSHOT_HISTORY_KEY, (items) => {
        resolve(items?.[SNAPSHOT_HISTORY_KEY]);
      });
    });
    return Array.isArray(data) ? data : [];
  }

  async function writeRawHistory(history) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [SNAPSHOT_HISTORY_KEY]: history }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(history);
      });
    });
  }

  async function migrateLegacySnapshot() {
    const data = await new Promise((resolve) => {
      chrome.storage.local.get([SNAPSHOT_HISTORY_KEY, LAST_NOTE_SNAPSHOT_KEY], (items) => {
        resolve(items);
      });
    });
    const history = Array.isArray(data?.[SNAPSHOT_HISTORY_KEY]) ? data[SNAPSHOT_HISTORY_KEY] : [];
    if (history.length > 0) {
      return history;
    }
    const legacy = data?.[LAST_NOTE_SNAPSHOT_KEY];
    if (!legacy) {
      return [];
    }
    const entry = normalizeEntry(legacy);
    await writeRawHistory([entry]);
    return [entry];
  }

  async function readSnapshotHistory() {
    const history = await readRawHistory();
    if (history.length > 0) {
      return history;
    }
    return migrateLegacySnapshot();
  }

  async function getSnapshotById(id) {
    const history = await readSnapshotHistory();
    return history.find((entry) => entry.id === id) || null;
  }

  async function appendSnapshot(snapshot) {
    const history = await readSnapshotHistory();
    const entry = normalizeEntry(snapshot);
    const nextHistory = [entry, ...history.filter((item) => item.id !== entry.id)].slice(
      0,
      MAX_SNAPSHOTS
    );
    await writeRawHistory(nextHistory);
    return entry;
  }

  async function updateSnapshot(id, snapshot) {
    const history = await readSnapshotHistory();
    const index = history.findIndex((entry) => entry.id === id);
    if (index === -1) {
      return appendSnapshot({ ...snapshot, id });
    }
    const entry = normalizeEntry({ ...history[index], ...snapshot }, id);
    const nextHistory = [...history];
    nextHistory[index] = entry;
    await writeRawHistory(nextHistory);
    return entry;
  }

  self.MirrorChatSnapshotHistoryManager = {
    readSnapshotHistory,
    getSnapshotById,
    appendSnapshot,
    updateSnapshot,
    migrateLegacySnapshot
  };
})();
