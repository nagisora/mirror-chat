// @ts-check
const path = require("path");

const customProfile = !!process.env.MIRRORCHAT_USER_DATA_DIR;

/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
  testDir: path.join(__dirname, "tests"),
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  timeout: 120_000,
  // 実プロファイル起動は遅く、chrome-extension:// への遷移も余裕を持たせる
  expect: { timeout: customProfile ? 30_000 : 10_000 },
  use: {
    trace: "on-first-retry",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    ...(customProfile ? { navigationTimeout: 60_000 } : {}),
  },
  projects: [{ name: "chromium-extension", testMatch: /.*\.spec\.js/ }],
};

module.exports = config;
