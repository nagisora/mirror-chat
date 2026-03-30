/**
 * Content Script 共通ハンドラ
 * 各 AI 固有の content-xxx.js から config を渡して利用する
 */
(function () {
  const TIMEOUT_MS = window.MirrorChatConstants?.TIMEOUT_MS || {
    RESPONSE_WAIT: 15000,
    STABLE_WAIT: 1500
  };
  const HUMAN_DELAY_MS = window.MirrorChatConstants?.HUMAN_DELAY_MS || {
    MIN: 2000,
    MAX: 3500,
    FALLBACK: 2500
  };
  const MESSAGE_TYPES = window.MirrorChatConstants?.MESSAGE_TYPES || {};
  const MSG_SEND_ONLY = MESSAGE_TYPES.SEND_ONLY || "MIRRORCHAT_SEND_ONLY";
  const MSG_FETCH_ONLY = MESSAGE_TYPES.FETCH_ONLY || "MIRRORCHAT_FETCH_ONLY";

  function createMirrorChatHandler(defaultConfig) {
    return function (msg, _sender, sendResponse) {
      if (msg.type !== MSG_SEND_ONLY && msg.type !== MSG_FETCH_ONLY) return;

      const config = { ...defaultConfig, ...(msg.config || {}) };
      const inputSelector = config.inputSelector;
      const submitSelector = config.submitButtonSelector;
      const answerSelector = config.answerContainerSelector;
      const copySelector = config.copyButtonSelector;
      // ストレージに空が保存されていても defaultConfig の doneCheckSelector をフォールバック
      const doneSelector = (config.doneCheckSelector || defaultConfig.doneCheckSelector || "").trim() || "";
      const submitMethod = config.submitMethod || "clickSubmitOrEnter";
      const useInputSuccessFallback = config.inputSuccessFallback === "chatgpt";

      if (msg.type === MSG_SEND_ONLY) {
        (async () => {
          try {
            const utils = window.MirrorChatUtils || {};
            const input = await (utils.waitFor
              ? utils.waitFor(inputSelector)
              : Promise.resolve(document.querySelector(inputSelector)));

            if (!input) {
              sendResponse({ ok: false, error: "入力欄が見つかりません" });
              return;
            }

            utils.simulateInput(input, msg.prompt);

            if (useInputSuccessFallback) {
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
                  // textContent は HTML をエスケープするため XSS 安全。innerHTML は使用しないこと。
                  input.textContent = msg.prompt;
                  input.dispatchEvent(
                    new InputEvent("input", {
                      bubbles: true,
                      inputType: "insertText",
                      data: msg.prompt
                    })
                  );
                }
              }
            }

            const delayMin = HUMAN_DELAY_MS.MIN || 2000;
            const delayMax = HUMAN_DELAY_MS.MAX || 3500;
            const delayFallback = HUMAN_DELAY_MS.FALLBACK || 2500;
            await (utils.humanDelay
              ? utils.humanDelay(delayMin, delayMax)
              : new Promise((r) => setTimeout(r, delayFallback)));

            if (submitMethod === "pressEnterToSubmit") {
              utils.pressEnterToSubmit(input);
            } else {
              await utils.clickSubmitOrEnter(submitSelector, input);
            }

            sendResponse({ ok: true });
          } catch (e) {
            sendResponse({ ok: false, error: e.message || String(e) });
          }
        })();
        return true;
      }

      if (msg.type === MSG_FETCH_ONLY) {
        (async () => {
          const utils = window.MirrorChatUtils || {};
          try {
            let markdown = "";
            const responseWait = TIMEOUT_MS.RESPONSE_WAIT || 15000;
            const stableWait = TIMEOUT_MS.STABLE_WAIT || 1500;

            if (utils.fetchResponseTextWithWait) {
              markdown = await utils.fetchResponseTextWithWait(
                copySelector,
                answerSelector,
                doneSelector,
                responseWait,
                stableWait
              );
            } else if (utils.getResponseText) {
              markdown = await utils.getResponseText(copySelector, answerSelector);
            }
            sendResponse({ markdown });
          } catch (e) {
            sendResponse({ markdown: "", error: e.message || String(e) });
          }
        })();
        return true;
      }
    };
  }

  window.MirrorChatContentHandler = { createMirrorChatHandler };
})();
