/**
 * Playwright 用 Chrome 拡張機能テストフィクスチャ
 * 拡張機能を読み込んだブラウザコンテキストを提供する
 *
 * @see https://playwright.dev/docs/chrome-extensions
 */
const { test: base, chromium } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const pathToExtension = path.join(__dirname, "..", "ai-prompt-broadcaster");

const defaultUserDataDir = path.join(__dirname, ".playwright-user-data");

/**
 * ログイン済みの Chrome プロファイルを使う場合、環境変数で User Data ルートを指定する
 * （zip 展開先や ~/.config/google-chrome など。中に Default/ と Local State がある階層）
 *
 * Google Chrome で作ったプロファイルをそのまま使うときは、Playwright 同梱の Chromium では
 * Cookie 等が読めず各サイト未ログインになることがあるため、カスタム指定時は既定で
 * システムの Google Chrome（channel: chrome）で起動する。
 *
 * あえて Chromium で起動する場合: MIRRORCHAT_E2E_BROWSER_CHANNEL=chromium
 * チャンネル明示: MIRRORCHAT_E2E_BROWSER_CHANNEL=chrome | chromium | msedge
 * Chrome の実体: MIRRORCHAT_CHROME_EXECUTABLE（Playwright の channel 既定パスに無い場合）
 */
const userDataDir = process.env.MIRRORCHAT_USER_DATA_DIR || defaultUserDataDir;

function isExecutableFile(p) {
  try {
    fs.accessSync(p, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** @returns {string | null} */
function findSystemChromeExecutable() {
  const fromEnv = process.env.MIRRORCHAT_CHROME_EXECUTABLE;
  if (fromEnv && fs.existsSync(fromEnv)) {
    return fromEnv;
  }
  const candidates = [
    "/opt/google/chrome/chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/local/bin/google-chrome",
    "/var/lib/flatpak/exports/bin/com.google.Chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ];
  for (const p of candidates) {
    if (fs.existsSync(p) && isExecutableFile(p)) {
      return p;
    }
  }
  return null;
}

function launchOptionsForProfile() {
  const args = [
    `--disable-extensions-except=${pathToExtension}`,
    `--load-extension=${pathToExtension}`,
  ];
  const base = {
    headless: false,
    args,
    ignoreDefaultArgs: ["--disable-extensions"],
  };

  const hasCustomUserData =
    !!process.env.MIRRORCHAT_USER_DATA_DIR &&
    path.resolve(userDataDir) !== path.resolve(defaultUserDataDir);

  if (!hasCustomUserData) {
    return base;
  }

  const ch = (process.env.MIRRORCHAT_E2E_BROWSER_CHANNEL || "").trim().toLowerCase();
  if (ch === "chromium" || ch === "playwright" || ch === "pw") {
    return base;
  }
  if (ch === "msedge") {
    return { ...base, channel: "msedge" };
  }
  // channel: chrome は環境によっては未インストールの固定パスを参照するため、見つかれば executablePath を優先
  const chromeExe = findSystemChromeExecutable();
  if (chromeExe) {
    return { ...base, executablePath: chromeExe };
  }
  return { ...base, channel: ch || "chrome" };
}

const test = base.extend({
  context: async ({}, use) => {
    // Chrome拡張は headed モード必須。CI では xvfb で仮想ディスプレイを使用
    const context = await chromium.launchPersistentContext(userDataDir, launchOptionsForProfile());
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
