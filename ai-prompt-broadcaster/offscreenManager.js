(function () {
  const OFFSCREEN_DOCUMENT_PATH = "offscreen.html";
  let offscreenCreating = null;

  async function ensureOffscreenDocument() {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)]
    });
    if (existingContexts.length > 0) return;

    if (offscreenCreating) {
      await offscreenCreating;
      return;
    }

    offscreenCreating = chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: ["CLIPBOARD"],
      justification: "AI応答テキストをクリップボードから取得するため"
    });

    try {
      await offscreenCreating;
    } finally {
      offscreenCreating = null;
    }
  }

  self.MirrorChatOffscreenManager = {
    ensureOffscreenDocument
  };
})();