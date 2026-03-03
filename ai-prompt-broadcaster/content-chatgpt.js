(function () {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    const cfg = msg.config || {};
    const inputSel =
      cfg.inputSelector || "div#prompt-textarea, div.ProseMirror[contenteditable='true']";
    const submitSel =
      cfg.submitButtonSelector ||
      "button#composer-submit-button, button[data-testid='send-button']";
    const answerSel =
      cfg.answerContainerSelector || "main div[data-testid='conversation-turns'], main";
    const copySel = cfg.copyButtonSelector || "button[aria-label='Copy'], [data-testid*='copy']";
    const doneSel = cfg.doneCheckSelector || "button[data-testid='stop-button']";

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

          const inputSuccess = input.textContent.includes(msg.prompt);
          if (!inputSuccess) {
            input.focus();
            document.execCommand("selectAll", false);
            document.execCommand("insertText", false, msg.prompt);

            if (!input.textContent.includes(msg.prompt)) {
              const dt = new DataTransfer();
              dt.setData("text/plain", msg.prompt);
              input.dispatchEvent(
                new ClipboardEvent("paste", {
                  bubbles: true,
                  cancelable: true,
                  clipboardData: dt
                })
              );
            }

            if (!input.textContent.includes(msg.prompt)) {
              input.innerHTML = "<p>" + msg.prompt + "</p>";
              input.dispatchEvent(
                new InputEvent("input", {
                  bubbles: true,
                  inputType: "insertText",
                  data: msg.prompt
                })
              );
            }
          }

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
        try {
          const utils = window.MirrorChatUtils || {};

          // 応答が完了するまで待つ（stopボタンが消えるまで + DOM安定）
          if (utils.waitForResponseComplete) {
            // ChatGPT もストリーミングが長く続くケースがあるため、Claude / Gemini / Grok と同等に延長
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

          // 応答テキストを取得（コピーボタン → DOM フォールバック）
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
