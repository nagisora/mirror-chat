(function () {
  const defaultConfig = {
    inputSelector:
      "rich-textarea div[contenteditable='true'], div.ql-editor[contenteditable='true'], div[contenteditable='true'], textarea",
    submitButtonSelector:
      "button.send-button, button[aria-label='Send message'], button[mat-icon-button], button[type='submit']",
    answerContainerSelector: "main, [data-model-id]",
    copyButtonSelector: "button[aria-label='Copy'], [aria-label*='Copy']",
    doneCheckSelector: "button[aria-label='Stop'], mat-icon[data-mat-icon-name='stop_circle']",
    submitMethod: "clickSubmitOrEnter"
  };
  chrome.runtime.onMessage.addListener(
    window.MirrorChatContentHandler.createMirrorChatHandler(defaultConfig)
  );
})();
