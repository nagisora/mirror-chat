(function () {
  const { STORAGE_KEYS } = self.MirrorChatConstants;
  const LAST_NOTE_SNAPSHOT_KEY = STORAGE_KEYS.LAST_NOTE_SNAPSHOT;

  function readLastNoteSnapshot() {
    return new Promise((resolve) => {
      chrome.storage.local.get(LAST_NOTE_SNAPSHOT_KEY, (data) => {
        resolve(data?.[LAST_NOTE_SNAPSHOT_KEY] || null);
      });
    });
  }

  function writeLastNoteSnapshot(snapshot) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [LAST_NOTE_SNAPSHOT_KEY]: snapshot }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(snapshot);
      });
    });
  }

  self.MirrorChatLastNoteSnapshotManager = {
    readLastNoteSnapshot,
    writeLastNoteSnapshot
  };
})();