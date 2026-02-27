(function () {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type !== "MIRRORCHAT_START") return;
    const cfg = msg.config || {};
    const inputSel = cfg.inputSelector || "textarea, div[contenteditable='true']";
    const submitSel = cfg.submitButtonSelector || "button[type='submit']";
    const answerSel = cfg.answerContainerSelector || "main, article";

    (async () => {
      try {
        const { waitFor, htmlToMarkdown, waitForStable } = window.MirrorChatUtils || {};
        const input = await (waitFor ? waitFor(inputSel) : Promise.resolve(document.querySelector(inputSel)));
        if (!input) {
          sendResponse({ markdown: "", error: "入力欄が見つかりません" });
          return;
        }
        input.focus();
        if (input.isContentEditable || input.getAttribute("contenteditable") === "true") {
          input.innerText = msg.prompt;
          input.dispatchEvent(new Event("input", { bubbles: true }));
        } else {
          input.value = msg.prompt;
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }

        const submit = document.querySelector(submitSel);
        if (submit && !submit.disabled) submit.click();

        if (waitForStable) {
          await waitForStable(answerSel, 4000);
        } else {
          await new Promise((r) => setTimeout(r, 6000));
        }

        const container = document.querySelector(answerSel);
        const markdown = (htmlToMarkdown && container) ? htmlToMarkdown(container) : (container?.innerText || "");
        sendResponse({ markdown });
      } catch (e) {
        sendResponse({ markdown: "", error: e.message || String(e) });
      }
    })();
    return true;
  });
})();
