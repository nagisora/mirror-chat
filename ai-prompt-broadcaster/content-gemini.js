(function () {
  const defaultConfig = window.MirrorChatConstants?.AI_CONFIG_DEFAULTS?.gemini;
  if (window._mirrorChatListener_gemini) return;
  window._mirrorChatListener_gemini = true;
  chrome.runtime.onMessage.addListener(
    window.MirrorChatContentHandler.createMirrorChatHandler(defaultConfig)
  );
})();
