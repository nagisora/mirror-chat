(function () {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type !== "MIRRORCHAT_START") return;
    const cfg = msg.config || {};
    // Claude: Tiptap (ProseMirror) ベースの contenteditable
    const inputSel = cfg.inputSelector || "div[data-testid='chat-input'], div.tiptap.ProseMirror[contenteditable='true'], .ProseMirror[contenteditable='true']";
    // 送信ボタン: Button_claude クラスで特定（aria-label はロケール依存のため使わない）
    const submitSel = cfg.submitButtonSelector || "button[class*='Button_claude'], div.shrink-0 button[aria-label]";
    const answerSel = cfg.answerContainerSelector || "[data-testid='conversation-thread'], main, [class*='message']";
    const copySel = cfg.copyButtonSelector || "[data-testid='action-bar-copy'], button[aria-label='Copy']";
    const doneSel = cfg.doneCheckSelector || "[data-testid='stop-button'], button[aria-label='Stop']";

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

        // 応答が完了するまで待つ
        if (utils.waitForResponseComplete) {
          await utils.waitForResponseComplete(answerSel, doneSel, 90000, 5000);
        } else if (utils.waitForStable) {
          await utils.waitForStable(answerSel, 3000);
        } else {
          await new Promise((r) => setTimeout(r, 5000));
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
