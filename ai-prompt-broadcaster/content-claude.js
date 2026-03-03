(function () {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    const cfg = msg.config || {};
    // Claude: Tiptap (ProseMirror) ベースの contenteditable
    const inputSel =
      cfg.inputSelector ||
      "div[data-testid='chat-input'], div.tiptap.ProseMirror[contenteditable='true'], .ProseMirror[contenteditable='true']";
    // 送信ボタン: Button_claude クラスで特定（aria-label はロケール依存のため使わない）
    const submitSel =
      cfg.submitButtonSelector ||
      "button[class*='Button_claude'], div.shrink-0 button[aria-label]";
    const answerSel =
      cfg.answerContainerSelector || "[data-testid='conversation-thread'], main, [class*='message']";
    const copySel =
      cfg.copyButtonSelector || "[data-testid='action-bar-copy'], button[aria-label='Copy']";
    const doneSel =
      cfg.doneCheckSelector || "[data-testid='stop-button'], button[aria-label='Stop']";

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

          // ボタンクリックを優先、フォールバックで Enter
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
        try {
          const utils = window.MirrorChatUtils || {};

          // 応答が完了するまで待つ
          if (utils.waitForResponseComplete) {
            // Claude も長めのストリーミングになることが多いため、待機を Gemini / Grok と揃えて延長
            await utils.waitForResponseComplete(answerSel, doneSel, 120000, 8000);
          } else if (utils.waitForStable) {
            await utils.waitForStable(answerSel, 8000);
          } else {
            await new Promise((r) => setTimeout(r, 8000));
          }

          // 念のため完了後も少し待ってからコピーする（ボタン状態の反映待ち）
          if (utils.humanDelay) {
            await utils.humanDelay(1500, 2500);
          } else {
            await new Promise((r) => setTimeout(r, 2000));
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
              markdown =
                utils.htmlToMarkdown && container
                  ? utils.htmlToMarkdown(container)
                  : container?.innerText || "";
            }
          } else {
            const container = document.querySelector(answerSel);
            markdown =
              utils.htmlToMarkdown && container
                ? utils.htmlToMarkdown(container)
                : container?.innerText || "";
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
