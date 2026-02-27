(function () {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type !== 'EXECUTE_PROMPT') return;
    executePrompt(msg.prompt, msg.selectors || {}).then(sendResponse);
    return true;
  });

  async function executePrompt(prompt, selectors) {
    const inputSel = selectors.input || "textarea[data-id], #prompt-textarea, textarea";
    const submitSel = selectors.submit || "button[data-testid='send-button'], [data-testid='send-button'], button[aria-label*='Send']";
    const responseSel = selectors.response || "[data-message-author-role='assistant'] .markdown, [data-message-author-role='assistant'], .markdown";

    try {
      const input = findElement(inputSel);
      if (!input) throw new Error('入力欄が見つかりません');

      await setInputValue(input, prompt);
      await sleep(300);

      const submitBtn = findElement(submitSel);
      if (!submitBtn) throw new Error('送信ボタンが見つかりません');
      submitBtn.click();

      const content = await waitForResponse(responseSel);
      chrome.runtime.sendMessage({ type: 'RESPONSE_READY', serviceId: 'chatgpt', content });
    } catch (err) {
      chrome.runtime.sendMessage({ type: 'RESPONSE_READY', serviceId: 'chatgpt', content: null, error: err.message });
    }
  }

  function findElement(selectorStr) {
    const selectors = selectorStr.split(',').map(s => s.trim());
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function setInputValue(el, value) {
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (el.isContentEditable) {
      el.focus();
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function waitForResponse(selectorStr, maxWait = 120000) {
    return new Promise((resolve) => {
      const selectors = selectorStr.split(',').map(s => s.trim());
      let lastChange = Date.now();
      const stabilityMs = 3000;

      const extract = () => {
        for (const sel of selectors) {
          const els = document.querySelectorAll(sel);
          const last = els[els.length - 1];
          if (last) {
            const text = last.innerText || last.textContent || '';
            if (text.trim().length > 10) return text.trim();
          }
        }
        return null;
      };

      const check = () => {
        const text = extract();
        if (text) {
          const now = Date.now();
          if (now - lastChange > stabilityMs) {
            resolve(text);
            return true;
          }
        } else {
          lastChange = Date.now();
        }
        return false;
      };

      const observer = new MutationObserver(() => {
        if (check()) observer.disconnect();
      });

      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      const interval = setInterval(() => {
        if (check()) {
          clearInterval(interval);
          observer.disconnect();
        }
      }, 500);

      setTimeout(() => {
        clearInterval(interval);
        observer.disconnect();
        resolve(extract() || '');
      }, maxWait);
    });
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }
})();
