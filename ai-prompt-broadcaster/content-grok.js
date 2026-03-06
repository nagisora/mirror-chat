(function () {
  const defaultConfig = {
    inputSelector: "div[contenteditable='true'], textarea",
    answerContainerSelector: "main, article",
    copyButtonSelector: "button[aria-label='Copy'], [aria-label*='Copy']",
    doneCheckSelector: "button[aria-label='Stop'], button[aria-label='Cancel']",
    submitMethod: "pressEnterToSubmit"
  };
  if (window._mirrorChatListener_grok) return;
  window._mirrorChatListener_grok = true;
  chrome.runtime.onMessage.addListener(
    window.MirrorChatContentHandler.createMirrorChatHandler(defaultConfig)
  );
})();
