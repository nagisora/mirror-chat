(function () {
  const LOG = (...args) => console.log("[MirrorChat:ChatGPT]", ...args);
  const ERR = (...args) => console.error("[MirrorChat:ChatGPT]", ...args);

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type !== "MIRRORCHAT_START") return;
    LOG("メッセージ受信:", msg.type, "prompt:", msg.prompt?.slice(0, 30));

    const cfg = msg.config || {};
    const inputSel = cfg.inputSelector || "div#prompt-textarea, div.ProseMirror[contenteditable='true']";
    const submitSel = cfg.submitButtonSelector || "button#composer-submit-button, button[data-testid='send-button']";
    const answerSel = cfg.answerContainerSelector || "main div[data-testid='conversation-turns'], main";

    LOG("使用セレクタ:", { inputSel, submitSel });

    (async () => {
      try {
        const utils = window.MirrorChatUtils || {};
        LOG("MirrorChatUtils 存在:", !!utils.simulateInput, "関数一覧:", Object.keys(utils));

        // --- 要素検索 ---
        LOG("入力欄を検索中... セレクタ:", inputSel);
        const input = await (utils.waitFor ? utils.waitFor(inputSel) : Promise.resolve(document.querySelector(inputSel)));
        LOG("入力欄の検索結果:", {
          found: !!input,
          tagName: input?.tagName,
          id: input?.id,
          contentEditable: input?.contentEditable,
          className: input?.className?.slice(0, 60),
          display: input ? getComputedStyle(input).display : "N/A",
          visibility: input ? getComputedStyle(input).visibility : "N/A",
          offsetHeight: input?.offsetHeight
        });

        if (!input) {
          ERR("入力欄が見つかりません。ページ上の候補要素:");
          document.querySelectorAll("[contenteditable='true']").forEach((el, i) => {
            LOG(`  contenteditable[${i}]:`, el.tagName, el.id, el.className?.slice(0, 40));
          });
          document.querySelectorAll("textarea").forEach((el, i) => {
            LOG(`  textarea[${i}]:`, el.name, el.className?.slice(0, 40), "display:", getComputedStyle(el).display);
          });
          sendResponse({ markdown: "", error: "入力欄が見つかりません" });
          return;
        }

        // --- 入力 ---
        LOG("simulateInput 実行前のテキスト:", JSON.stringify(input.textContent?.slice(0, 50)));
        utils.simulateInput(input, msg.prompt);
        LOG("simulateInput 実行後のテキスト:", JSON.stringify(input.textContent?.slice(0, 50)));

        const inputSuccess = input.textContent.includes(msg.prompt);
        LOG("入力成功:", inputSuccess);

        if (!inputSuccess) {
          ERR("simulateInput が失敗。手動フォールバックを試行...");

          // デバッグ: 各手法を個別にテスト
          input.focus();
          LOG("  手法1: execCommand selectAll+insertText");
          document.execCommand("selectAll", false);
          const r1 = document.execCommand("insertText", false, msg.prompt);
          LOG("  execCommand insertText 戻り値:", r1, "テキスト:", JSON.stringify(input.textContent?.slice(0, 50)));

          if (!input.textContent.includes(msg.prompt)) {
            LOG("  手法2: ClipboardEvent paste");
            const dt = new DataTransfer();
            dt.setData("text/plain", msg.prompt);
            input.dispatchEvent(new ClipboardEvent("paste", {
              bubbles: true, cancelable: true, clipboardData: dt
            }));
            LOG("  paste後テキスト:", JSON.stringify(input.textContent?.slice(0, 50)));
          }

          if (!input.textContent.includes(msg.prompt)) {
            LOG("  手法3: innerHTML で直接設定");
            input.innerHTML = "<p>" + msg.prompt + "</p>";
            input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: msg.prompt }));
            LOG("  innerHTML後テキスト:", JSON.stringify(input.textContent?.slice(0, 50)));
          }
        }

        // --- 遅延 ---
        LOG("人間遅延を開始...");
        await (utils.humanDelay ? utils.humanDelay(2000, 3500) : new Promise((r) => setTimeout(r, 2500)));
        LOG("人間遅延完了");

        // --- 送信 ---
        LOG("送信を実行... セレクタ:", submitSel);
        await utils.clickSubmitOrEnter(submitSel, input);
        LOG("送信完了");

        // --- 回答待機 ---
        if (utils.waitForStable) {
          await utils.waitForStable(answerSel, 3000);
        } else {
          await new Promise((r) => setTimeout(r, 5000));
        }

        const container = document.querySelector(answerSel);
        const markdown = (utils.htmlToMarkdown && container) ? utils.htmlToMarkdown(container) : (container?.innerText || "");
        LOG("完了。マークダウン長:", markdown.length);
        sendResponse({ markdown });
      } catch (e) {
        ERR("例外:", e.message, e.stack);
        sendResponse({ markdown: "", error: e.message || String(e) });
      }
    })();
    return true;
  });
})();
