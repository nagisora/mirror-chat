/**
 * MirrorChat Chrome 拡張機能 E2E テスト
 *
 * 実行前に各AIサービス（ChatGPT, Claude, Gemini, Grok）にログイン済みの
 * Chrome プロファイルを使うと、送信〜回答取得までフルにテストできます。
 *
 * ログイン済みプロファイルを使う場合:
 *   MIRRORCHAT_USER_DATA_DIR=/path/to/chrome/profile pnpm test
 *
 * 未ログインの場合は「サイトを開く」「ポップアップ表示」などの基本動作のみ検証します。
 */
const { test, expect } = require("../fixtures");

test.describe("MirrorChat 拡張機能", () => {
  test("ポップアップが表示され、タイトルが正しい", async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(page.locator("h1")).toHaveText("MirrorChat");
    await expect(page.locator("#prompt-input")).toBeVisible();
    await expect(page.locator("#open-tabs-button")).toBeVisible();
  });

  test("「サイトを開く」で4つのAIタブが開く", async ({ context, page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    const openTabsBtn = page.locator("#open-tabs-button");
    await openTabsBtn.click();

    await expect(page.locator("#status")).toContainText(/開きました|開いています/, {
      timeout: 15_000,
    });

    // 送信ボタンが有効＝拡張機能が4つのタブを開いたと認識している
    await expect(page.locator("#send-button")).toBeEnabled({ timeout: 5_000 });
  });

  test("タブが開くまで送信ボタンは無効", async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(page.locator("#send-button")).toBeDisabled();
  });

  test("設定ページが表示される", async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`);
    await expect(page.locator("h1")).toHaveText("MirrorChat 設定");
    await expect(page.locator("#obsidian-base-url")).toBeVisible();
  });

  test("質問入力して送信ボタンを押すと送信が開始される", async ({
    context,
    page,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    const openTabsBtn = page.locator("#open-tabs-button");
    await openTabsBtn.click();
    await expect(page.locator("#status")).toContainText(/開きました|開いています/, {
      timeout: 15_000,
    });

    const promptInput = page.locator("#prompt-input");
    await promptInput.fill("1+1は？");
    const sendBtn = page.locator("#send-button");
    await sendBtn.click();

    await expect(page.locator("#status")).toContainText(/送信|開始/, {
      timeout: 5_000,
    });
  });
});
