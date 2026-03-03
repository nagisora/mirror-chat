(function () {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    const cfg = msg.config || {};
    // Gemini: rich-textarea 内の contenteditable、または Quill-like エディタ
    const inputSel =
      cfg.inputSelector ||
      "rich-textarea div[contenteditable='true'], div.ql-editor[contenteditable='true'], div[contenteditable='true'], textarea";
    const submitSel =
      cfg.submitButtonSelector ||
      "button.send-button, button[aria-label='Send message'], button[mat-icon-button], button[type='submit']";
    const answerSel = cfg.answerContainerSelector || "main, [data-model-id]";
    const copySel = cfg.copyButtonSelector || "button[aria-label='Copy'], [aria-label*='Copy']";
    const doneSel =
      cfg.doneCheckSelector || "button[aria-label='Stop'], mat-icon[data-mat-icon-name='stop_circle']";

    // フェーズ1: プロンプト入力＋送信のみ
    if (msg.type === "MIRRORCHAT_SEND_ONLY") {
      (async () => {
        try {
          const utils = window.MirrorChatUtils || {};
          const input = await (utils.waitFor
            ? utils.waitFor(inputSel)
            : Promise.resolve(document.querySelector(inputSel)));
          if (!input) {
            sendResponse({ ok: false, error: "入力欄が見つかりません" });
            return;
          }

          utils.simulateInput(input, msg.prompt);

          await (utils.humanDelay
            ? utils.humanDelay(2000, 3500)
            : new Promise((r) => setTimeout(r, 2500)));

          await utils.clickSubmitOrEnter(submitSel, input);

          sendResponse({ ok: true });
        } catch (e) {
          sendResponse({ ok: false, error: e.message || String(e) });
        }
      })();
      return true;
    }

    // フェーズ2: 応答完了待ち＋テキスト取得のみ
    if (msg.type === "MIRRORCHAT_FETCH_ONLY") {
      (async () => {
        const utils = window.MirrorChatUtils || {};
        try {
          let markdown = "";
          if (utils.fetchResponseTextWithWait) {
            markdown = await utils.fetchResponseTextWithWait(
              copySel,
              answerSel,
              doneSel,
              15000,
              1500
            );
          } else if (utils.getResponseText) {
            markdown = await utils.getResponseText(copySel, answerSel);
          }
          sendResponse({ markdown });
        } catch (e) {
          sendResponse({ markdown: "", error: e.message || String(e) });
        }
      })();
      return true;
    }
  });
})();
