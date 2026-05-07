import { defineConfig, devices } from '@playwright/test';

var PORT = process.env.MAPSHAPER_PLAYWRIGHT_PORT || 5577;
var BASE_URL = 'http://localhost:' + PORT;

export default defineConfig({
  testDir: './browser-tests',
  timeout: 30 * 1000,
  expect: {
    timeout: 5 * 1000
  },
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: devices['Desktop Chrome']
    }
  ],
  webServer: {
    command: 'MAPSHAPER_GUI_NO_OPEN=1 bin/mapshaper-gui -p ' + PORT,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 10 * 1000
  }
});
