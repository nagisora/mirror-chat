/**
 * オフスクリーンドキュメント: 拡張コンテキストでクリップボードを読み取る。
 * Content Script の navigator.clipboard.readText() はページコンテキストで実行されるため
 * 許可ダイアログが出て「許可」しても動作しない問題がある。
 * オフスクリーンドキュメントは拡張コンテキストで動作するため、clipboardRead 権限で
 * ダイアログなしで読み取り可能。
 */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== "MIRRORCHAT_READ_CLIPBOARD_INTERNAL") return false;

  (async () => {
    try {
      const text = await navigator.clipboard.readText();
      sendResponse({ ok: true, text: text || "" });
    } catch (e) {
      sendResponse({ ok: false, error: e?.message || String(e) });
    }
  })();
  return true; // 非同期 sendResponse のため true を返す
});
