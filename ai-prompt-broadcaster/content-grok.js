(function () {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type !== "MIRRORCHAT_START") return;
    const cfg = msg.config || {};
    const inputSel = cfg.inputSelector || "div[contenteditable='true'], textarea";
    const submitSel = cfg.submitButtonSelector || "button[type='submit'], button[aria-label='Send'], form button";
    const answerSel = cfg.answerContainerSelector || "main, article";

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
          await utils.waitForStable(answerSel, 4000);
        } else {
          await new Promise((r) => setTimeout(r, 6000));
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
