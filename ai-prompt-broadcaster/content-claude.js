(function () {
  const defaultConfig = {
    inputSelector:
      "div[data-testid='chat-input'], div.tiptap.ProseMirror[contenteditable='true'], .ProseMirror[contenteditable='true']",
    submitButtonSelector: "button[aria-label='メッセージを送信'], button[class*='_claude_'][aria-label*='送信'], button[class*='Button_claude'], div.shrink-0.flex.items-center button[aria-label*='送信'], div.shrink-0 button[aria-label*='送信'], button[aria-label*='Send'], button[aria-label*='送信'], [data-testid='send-button'], button[data-testid*='send'], form button[type='submit'], button[type='submit']",
    answerContainerSelector: "[data-testid='conversation-thread'], main, [class*='message']",
    copyButtonSelector: "[data-testid='action-bar-copy'], button[aria-label='Copy']",
    doneCheckSelector: "[data-testid='stop-button'], button[aria-label='Stop']",
    submitMethod: "clickSubmitOrEnter"
  };
  if (window._mirrorChatListener_claude) return;
  window._mirrorChatListener_claude = true;
  chrome.runtime.onMessage.addListener(
    window.MirrorChatContentHandler.createMirrorChatHandler(defaultConfig)
  );
})();
