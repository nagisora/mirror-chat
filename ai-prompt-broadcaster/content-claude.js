(function () {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type !== "MIRRORCHAT_START") return;
    const cfg = msg.config || {};
    const inputSel = cfg.inputSelector || ".ProseMirror[contenteditable='true'], div[contenteditable='true'], textarea";
    const submitSel = cfg.submitButtonSelector || "button[aria-label='Send Message'], button[type='submit'], fieldset button:last-of-type";
    const answerSel = cfg.answerContainerSelector || "[data-testid='conversation-thread'], main, [class*='message']";

    (async () => {
      try {
        const utils = window.MirrorChatUtils || {};
        const input = await (utils.waitFor ? utils.waitFor(inputSel) : Promise.resolve(document.querySelector(inputSel)));
        if (!input) {
          sendResponse({ markdown: "", error: "入力欄が見つかりません" });
          return;
        }

        if (utils.simulateInput) {
          utils.simulateInput(input, msg.prompt);
        } else {
          input.focus();
          if (input.isContentEditable) {
            input.innerText = msg.prompt;
          } else {
            input.value = msg.prompt;
          }
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }

        await new Promise((r) => setTimeout(r, 500));

        if (utils.clickSubmitOrEnter) {
          await utils.clickSubmitOrEnter(submitSel, input);
        } else {
          const submit = document.querySelector(submitSel);
          if (submit && !submit.disabled) submit.click();
        }

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
