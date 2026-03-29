(function () {
  const defaultConfig = window.MirrorChatConstants?.AI_CONFIG_DEFAULTS?.grok;
  if (window._mirrorChatListener_grok) return;
  window._mirrorChatListener_grok = true;
  chrome.runtime.onMessage.addListener(
    window.MirrorChatContentHandler.createMirrorChatHandler(defaultConfig)
  );
})();
