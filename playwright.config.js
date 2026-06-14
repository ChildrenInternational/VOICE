const { defineConfig } = require("@playwright/test");

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:8080";
const runLocalServer = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(baseURL);

module.exports = defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry"
  },
  webServer: runLocalServer ? {
    command: "npm start",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120000
  } : undefined
});
