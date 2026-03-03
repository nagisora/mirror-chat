(function () {
  const defaultConfig = {
    inputSelector: "div#prompt-textarea, div.ProseMirror[contenteditable='true']",
    submitButtonSelector: "button#composer-submit-button, button[data-testid='send-button']",
    answerContainerSelector: "main div[data-testid='conversation-turns'], main",
    copyButtonSelector: "button[aria-label='Copy'], [data-testid*='copy']",
    doneCheckSelector: "button[data-testid='stop-button']",
    submitMethod: "clickSubmitOrEnter",
    inputSuccessFallback: "chatgpt"
  };
  chrome.runtime.onMessage.addListener(
    window.MirrorChatContentHandler.createMirrorChatHandler(defaultConfig)
  );
})();
