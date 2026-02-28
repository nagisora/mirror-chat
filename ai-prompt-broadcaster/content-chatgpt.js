(function () {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type !== "MIRRORCHAT_START") return;
    const cfg = msg.config || {};
    const inputSel = cfg.inputSelector || "#prompt-textarea, textarea[data-id='root'], div[contenteditable='true'][id*='prompt'], textarea";
    const submitSel = cfg.submitButtonSelector || "button[data-testid='send-button'], button[data-testid='send'], form button[type='submit']";
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

        // 人間らしい遅延: 入力後すぐにボタンを押さない（bot判定回避）
        await (utils.humanDelay ? utils.humanDelay(2000, 3500) : new Promise((r) => setTimeout(r, 2500)));

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
