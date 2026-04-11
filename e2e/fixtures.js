/**
 * Playwright 用 Chrome 拡張機能テストフィクスチャ
 * 拡張機能を読み込んだブラウザコンテキストを提供する
 *
 * @see https://playwright.dev/docs/chrome-extensions
 */
const { test: base, chromium } = require("@playwright/test");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");

const pathToExtension = path.join(__dirname, "..", "ai-prompt-broadcaster");

/**
 * ログイン済みのChromeプロファイルを使う場合、環境変数で指定する
 * 例: MIRRORCHAT_USER_DATA_DIR=/home/user/.config/google-chrome/Default
 */
const userDataDir = process.env.MIRRORCHAT_USER_DATA_DIR || "";

function shouldRunHeaded() {
  return process.argv.includes("--headed") || process.argv.includes("--ui");
}

async function prepareUserDataDir() {
  if (userDataDir) {
    return {
      dir: userDataDir,
      cleanup: async () => {}
    };
  }

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mirrorchat-e2e-"));
  return {
    dir,
    cleanup: async () => {
      await fs.rm(dir, { recursive: true, force: true });
    }
  };
}

const test = base.extend({
  context: async ({}, use) => {
    const { dir, cleanup } = await prepareUserDataDir();
    const context = await chromium.launchPersistentContext(dir, {
      channel: "chromium",
      headless: !shouldRunHeaded(),
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
      ignoreDefaultArgs: ["--disable-extensions"],
    });

    try {
      await use(context);
    } finally {
      await context.close();
      await cleanup();
    }
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
