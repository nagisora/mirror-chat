(function () {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type !== "MIRRORCHAT_START") return;
    const cfg = msg.config || {};
    const inputSel = cfg.inputSelector || "div[contenteditable='true'], textarea";
    const answerSel = cfg.answerContainerSelector || "main, article";
    const copySel = cfg.copyButtonSelector || "button[aria-label='Copy'], [aria-label*='Copy']";
    const doneSel = cfg.doneCheckSelector || "button[aria-label='Stop'], button[aria-label='Cancel']";

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

        // Grok は Enter キーで送信する
        utils.pressEnterToSubmit(input);

        // 応答が完了するまで待つ
        if (utils.waitForResponseComplete) {
          await utils.waitForResponseComplete(answerSel, doneSel, 90000, 5000);
        } else if (utils.waitForStable) {
          await utils.waitForStable(answerSel, 4000);
        } else {
          await new Promise((r) => setTimeout(r, 6000));
        }

        // 応答テキストを取得
        let markdown = "";
        if (utils.getResponseText) {
          markdown = await utils.getResponseText(copySel, answerSel);
        } else if (utils.copyResponseViaClipboard) {
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
