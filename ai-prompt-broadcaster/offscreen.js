/**
 * オフスクリーンドキュメント: 拡張コンテキストでクリップボードを読み取る。
 * Content Script の navigator.clipboard.readText() はページコンテキストで実行されるため
 * 許可ダイアログが出て「許可」しても動作しない問題がある。
 * オフスクリーンドキュメントは拡張コンテキストで動作するため、clipboardRead 権限で
 * ダイアログなしで読み取り可能。
 */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const MESSAGE_TYPES = self.MirrorChatConstants?.MESSAGE_TYPES || {};
  const MSG_READ_CLIPBOARD_INTERNAL =
    MESSAGE_TYPES.READ_CLIPBOARD_INTERNAL || "MIRRORCHAT_READ_CLIPBOARD_INTERNAL";
  if (msg.type !== MSG_READ_CLIPBOARD_INTERNAL) return false;

  (async () => {
    try {
      // 1. まず navigator.clipboard.readText() を試行
      try {
        if (navigator.clipboard && navigator.clipboard.readText) {
          const text = await navigator.clipboard.readText();
          sendResponse({ ok: true, text: text || "" });
          return;
        }
      } catch (e) {
        // 一部環境では navigator.clipboard.readText() が DOMException を投げることがあるが、
        // フォールバックで確実に処理するため、ここでは情報レベルのログに留める。
        console.info(
          "MirrorChat: navigator.clipboard.readText failed, falling back to execCommand('paste'):",
          e && (e.message || String(e))
        );
      }

      // 2. 失敗した場合は execCommand("paste") にフォールバック
      const textarea = document.createElement("textarea");
      document.body.appendChild(textarea);
      textarea.focus();
      document.execCommand("paste");
      const text = textarea.value;
      document.body.removeChild(textarea);

      sendResponse({ ok: true, text: text || "" });
    } catch (e) {
      sendResponse({ ok: false, error: e?.message || String(e) });
    }
  })();
  return true; // 非同期 sendResponse のため true を返す
});
