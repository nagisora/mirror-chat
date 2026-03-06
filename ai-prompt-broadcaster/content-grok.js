(function () {
  const defaultConfig = {
    inputSelector: "div[contenteditable='true'], textarea",
    answerContainerSelector: "main, article",
    copyButtonSelector: "button[aria-label='Copy'], [aria-label*='Copy']",
    doneCheckSelector: "button[aria-label='Stop'], button[aria-label='Cancel']",
    submitMethod: "pressEnterToSubmit"
  };
  if (window._mirrorChatListenerAdded) return;
  window._mirrorChatListenerAdded = true;
  chrome.runtime.onMessage.addListener(
    window.MirrorChatContentHandler.createMirrorChatHandler(defaultConfig)
  );
})();
