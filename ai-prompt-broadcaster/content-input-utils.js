/**
 * 入力・送信系ユーティリティ
 * 同一タブへ複数回 inject される前提のため var を使用する
 */
(function () {
  function humanDelay(minMs = 2000, maxMs = 3500) {
    const ms = minMs + Math.random() * (maxMs - minMs);
    return new Promise((r) => setTimeout(r, ms));
  }

  function simulateInput(element, text) {
    element.focus();

    const isContentEditable =
      element.isContentEditable || element.getAttribute("contenteditable") === "true";

    if (isContentEditable) {
      document.execCommand("selectAll", false);
      document.execCommand("insertText", false, text);

      if (!element.textContent.includes(text)) {
        const dt = new DataTransfer();
        dt.setData("text/plain", text);
        element.dispatchEvent(new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData: dt
        }));
      }

      if (!element.textContent.includes(text)) {
        element.textContent = text;
        const sel = window.getSelection();
        const r = document.createRange();
        r.selectNodeContents(element);
        r.collapse(false);
        sel.removeAllRanges();
        sel.addRange(r);
        element.dispatchEvent(new InputEvent("input", {
          bubbles: true,
          inputType: "insertText",
          data: text
        }));
      }
    } else {
      element.select();

      const proto = element.tagName === "TEXTAREA"
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (nativeSetter) {
        nativeSetter.call(element, text);
      } else {
        element.value = text;
      }
      element.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: text
      }));
    }

    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function pressEnterToSubmit(element) {
    element.focus();
    const opts = {
      key: "Enter", code: "Enter", keyCode: 13, which: 13,
      bubbles: true, cancelable: true
    };
    element.dispatchEvent(new KeyboardEvent("keydown", opts));
    element.dispatchEvent(new KeyboardEvent("keypress", opts));
    element.dispatchEvent(new KeyboardEvent("keyup", opts));
  }

  async function clickSubmitOrEnter(submitSelector, inputElement, timeout = 8000) {
    const start = Date.now();
    const isClickable = (btn) => btn && !btn.disabled && btn.getAttribute("aria-disabled") !== "true";
    const doClick = async (btn) => {
      btn.scrollIntoView({ block: "center" });
      await new Promise((r) => setTimeout(r, 100));
      btn.click();
      return true;
    };

    const scope = inputElement
      ? inputElement.closest("form") ||
        inputElement.closest("[class*='box-content']") ||
        inputElement.closest("[class*='composer']") ||
        inputElement.closest("[class*='Composer']") ||
        inputElement.closest("main") ||
        document
      : document;

    while (Date.now() - start < timeout) {
      const selectors = submitSelector.split(",").map((s) => s.trim());
      for (const sel of selectors) {
        try {
          const btn = scope.querySelector(sel);
          if (isClickable(btn)) {
            await doClick(btn);
            return true;
          }
        } catch {
          /* セレクタが不正な場合は無視 */
        }
      }

      if (inputElement) {
        const form = inputElement.closest("form");
        const container =
          inputElement.closest("[role='form'], [class*='box-content'], [class*='composer'], [class*='input'], [class*='Composer']") ||
          inputElement.parentElement;
        const fallbackScope = form || container;
        if (fallbackScope) {
          const nearbyBtns = fallbackScope.querySelectorAll("button[type='submit'], button[aria-label*='Send'], button[aria-label*='送信'], [role='button'][aria-label*='Send']");
          for (const b of nearbyBtns) {
            if (b.getAttribute("data-testid") === "pin-sidebar-toggle") continue;
            if (isClickable(b)) {
              await doClick(b);
              return true;
            }
          }
        }
      }

      await new Promise((r) => setTimeout(r, 300));
    }

    if (inputElement) {
      inputElement.focus();
      const enterOpts = {
        key: "Enter", code: "Enter", keyCode: 13, which: 13,
        bubbles: true, cancelable: true
      };
      inputElement.dispatchEvent(new KeyboardEvent("keydown", enterOpts));
      inputElement.dispatchEvent(new KeyboardEvent("keypress", enterOpts));
      inputElement.dispatchEvent(new KeyboardEvent("keyup", enterOpts));
      return true;
    }
    return false;
  }

  window.MirrorChatUtils = window.MirrorChatUtils || {};
  window.MirrorChatUtils.humanDelay = humanDelay;
  window.MirrorChatUtils.simulateInput = simulateInput;
  window.MirrorChatUtils.pressEnterToSubmit = pressEnterToSubmit;
  window.MirrorChatUtils.clickSubmitOrEnter = clickSubmitOrEnter;
})();
