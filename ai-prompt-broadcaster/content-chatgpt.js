(function () {
  const defaultConfig = window.MirrorChatConstants?.AI_CONFIG_DEFAULTS?.chatgpt;
  if (window._mirrorChatListener_chatgpt) return;
  window._mirrorChatListener_chatgpt = true;
  chrome.runtime.onMessage.addListener(
    window.MirrorChatContentHandler.createMirrorChatHandler(defaultConfig)
  );
})();
