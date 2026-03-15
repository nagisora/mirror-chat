(function () {
  const defaultConfig = {
    inputSelector:
      "rich-textarea div[contenteditable='true'], div.ql-editor[contenteditable='true'], div[contenteditable='true'], textarea",
    submitButtonSelector:
      "button.send-button, button[aria-label='Send message'], button[aria-label*='Send'], button[aria-label*='送信'], button[mat-icon-button], button[mat-icon-button][aria-label], [aria-label='Send message'], button[type='submit'], [data-testid*='send']",
    answerContainerSelector: "main, [data-model-id]",
    copyButtonSelector: "button[aria-label='Copy'], [aria-label*='Copy']",
    doneCheckSelector: "button[aria-label='Stop'], mat-icon[data-mat-icon-name='stop_circle']",
    submitMethod: "clickSubmitOrEnter"
  };
  if (window._mirrorChatListener_gemini) return;
  window._mirrorChatListener_gemini = true;
  chrome.runtime.onMessage.addListener(
    window.MirrorChatContentHandler.createMirrorChatHandler(defaultConfig)
  );
})();
