/**
 * Playwright 用 Chrome 拡張機能テストフィクスチャ
 * 拡張機能を読み込んだブラウザコンテキストを提供する
 *
 * @see https://playwright.dev/docs/chrome-extensions
 */
const { test: base, chromium } = require("@playwright/test");
const path = require("path");

const pathToExtension = path.join(__dirname, "..", "ai-prompt-broadcaster");

/**
 * ログイン済みのChromeプロファイルを使う場合、環境変数で指定する
 * 例: MIRRORCHAT_USER_DATA_DIR=/home/user/.config/google-chrome/Default
 */
const userDataDir =
  process.env.MIRRORCHAT_USER_DATA_DIR || path.join(__dirname, ".playwright-user-data");

const test = base.extend({
  context: async ({}, use) => {
    // Chrome拡張は headed モード必須。CI では xvfb で仮想ディスプレイを使用
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
      ignoreDefaultArgs: ["--disable-extensions"],
    });
    await use(context);
    await context.close();
  },

  extensionId: async ({ context }, use) => {
    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent("serviceworker", { timeout: 15_000 });
    }
    const url = serviceWorker.url();
    const extensionId = url.split("/")[2];
    await use(extensionId);
  },
});

module.exports = { test, expect: test.expect };
