// @ts-check
const path = require("path");

/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
  testDir: path.join(__dirname, "tests"),
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  use: {
    trace: "on-first-retry",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium-extension", testMatch: /.*\.spec\.js/ }],
};

module.exports = config;
