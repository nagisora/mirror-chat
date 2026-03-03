(function () {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type !== "MIRRORCHAT_START") return;
    const cfg = msg.config || {};
    // Gemini: rich-textarea 内の contenteditable、または Quill-like エディタ
    const inputSel = cfg.inputSelector || "rich-textarea div[contenteditable='true'], div.ql-editor[contenteditable='true'], div[contenteditable='true'], textarea";
    const submitSel = cfg.submitButtonSelector || "button.send-button, button[aria-label='Send message'], button[mat-icon-button], button[type='submit']";
    const answerSel = cfg.answerContainerSelector || "main, [data-model-id]";
    const copySel = cfg.copyButtonSelector || "button[aria-label='Copy'], [aria-label*='Copy']";

    (async () => {
      try {
        const utils = window.MirrorChatUtils || {};
        const input = await (utils.waitFor ? utils.waitFor(inputSel) : Promise.resolve(document.querySelector(inputSel)));
        if (!input) {
          sendResponse({ markdown: "", error: "入力欄が見つかりません" });
          return;
        }

        utils.simulateInput(input, msg.prompt);

        await (utils.humanDelay ? utils.humanDelay(2000, 3500) : new Promise((r) => setTimeout(r, 2500)));

        await utils.clickSubmitOrEnter(submitSel, input);

        if (utils.waitForStable) {
          await utils.waitForStable(answerSel, 3000);
        } else {
          await new Promise((r) => setTimeout(r, 5000));
        }

        let markdown = "";
        if (utils.copyResponseViaClipboard) {
          try {
            markdown = await utils.copyResponseViaClipboard(copySel);
          } catch (e) {
            const container = document.querySelector(answerSel);
            markdown = (utils.htmlToMarkdown && container) ? utils.htmlToMarkdown(container) : (container?.innerText || "");
          }
        } else {
          const container = document.querySelector(answerSel);
          markdown = (utils.htmlToMarkdown && container) ? utils.htmlToMarkdown(container) : (container?.innerText || "");
        }
        sendResponse({ markdown });
      } catch (e) {
        sendResponse({ markdown: "", error: e.message || String(e) });
      }
    })();
    return true;
  });
})();
