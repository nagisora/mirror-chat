(function () {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type !== "MIRRORCHAT_START") return;
    const cfg = msg.config || {};
    // 重要: 非表示の <textarea name="prompt-textarea" style="display:none"> を避け、
    // ProseMirror の contenteditable div を確実に取得する
    const inputSel = cfg.inputSelector || "div#prompt-textarea, div.ProseMirror[contenteditable='true']";
    // 送信ボタンは id="composer-submit-button" で特定可能
    const submitSel = cfg.submitButtonSelector || "button#composer-submit-button, button[data-testid='send-button']";
    const answerSel = cfg.answerContainerSelector || "main div[data-testid='conversation-turns'], main";

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

        // ボタンクリックを優先、フォールバックで Enter
        await utils.clickSubmitOrEnter(submitSel, input);

        if (utils.waitForStable) {
          await utils.waitForStable(answerSel, 3000);
        } else {
          await new Promise((r) => setTimeout(r, 5000));
        }

        const container = document.querySelector(answerSel);
        const markdown = (utils.htmlToMarkdown && container) ? utils.htmlToMarkdown(container) : (container?.innerText || "");
        sendResponse({ markdown });
      } catch (e) {
        sendResponse({ markdown: "", error: e.message || String(e) });
      }
    })();
    return true;
  });
})();
