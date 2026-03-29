(function () {
  const defaultConfig = window.MirrorChatConstants?.AI_CONFIG_DEFAULTS?.claude;
  if (window._mirrorChatListener_claude) return;
  window._mirrorChatListener_claude = true;
  chrome.runtime.onMessage.addListener(
    window.MirrorChatContentHandler.createMirrorChatHandler(defaultConfig)
  );
})();
