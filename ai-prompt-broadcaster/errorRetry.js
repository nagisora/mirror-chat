(function () {
  const { STORAGE_KEYS } = self.MirrorChatConstants;
  const FAILED_ITEMS_KEY = STORAGE_KEYS.FAILED_ITEMS;

  async function appendFailedItemToLocal(payload) {
    const items = await new Promise((resolve) =>
      chrome.storage.local.get(FAILED_ITEMS_KEY, (x) => resolve(x[FAILED_ITEMS_KEY] || []))
    );
    items.push({ ...payload, ts: Date.now() });
    await new Promise((resolve) => chrome.storage.local.set({ [FAILED_ITEMS_KEY]: items }, resolve));
  }

  async function drainFailedItems() {
    const items = await new Promise((resolve) =>
      chrome.storage.local.get(FAILED_ITEMS_KEY, (x) => resolve(x[FAILED_ITEMS_KEY] || []))
    );
    await new Promise((resolve) => chrome.storage.local.set({ [FAILED_ITEMS_KEY]: [] }, resolve));
    return items;
  }

  self.MirrorChatRetryStore = {
    appendFailedItemToLocal,
    drainFailedItems
  };
})();