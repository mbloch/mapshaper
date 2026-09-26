import { expect, test } from '@playwright/test';

// The sidebar's icons are hidden on the splash screen, as the map's buttons on
// the right are, and appear once data is imported or the splash popup is
// dismissed. The first data to arrive opens the layer list beside it, whichever
// way it came in; dismissing the popup without importing anything does not.

var FIXTURE = 'test/data/issues/389_clipping_error/inner_polygon.json';

test('the splash screen shows neither the sidebar icons nor the map buttons', async function({page}) {
  await page.goto('/');
  await expect(page.locator('#import-options')).toBeVisible();
  await expect(page.locator('.sidebar-tabs')).toBeHidden();
  await expect(page.locator('.nav-buttons')).toBeHidden();
});

test('dismissing the splash popup shows the icons and leaves the sidebar closed', async function({page}) {
  await page.goto('/');
  await page.locator('#import-options .cancel-btn').click();
  await expect(page.locator('.sidebar-tabs')).toBeVisible();
  await expect(page.locator('.nav-buttons')).toBeVisible();
  expect(await getBodyClasses(page)).not.toContain('sidebar-open');

  // data imported later still opens the layer list
  await page.locator('input[type="file"]').last().setInputFiles(FIXTURE);
  await expect.poll(function() { return getBodyClasses(page); }).toContain('layers-open');
});

test('importing from the file dialog opens the layers panel', async function({page}) {
  await page.goto('/');
  await page.locator('input[type="file"]').last().setInputFiles(FIXTURE);
  await expect.poll(function() { return getBodyClasses(page); }).toContain('layers-open');
  await expect(page.locator('.sidebar-tabs')).toBeHidden(); // the sidebar is open
});

test('importing from the files URL parameter opens the layers panel', async function({page}) {
  await page.goto('/?files=' + encodeURIComponent(FIXTURE));
  await expect.poll(function() { return getBodyClasses(page); }).toContain('layers-open');
});

test('drawing on the empty map keeps its tool', async function({page}) {
  await page.goto('/?undo=on&undo-test=on');
  await page.waitForFunction(function() {
    return window.mapshaper && window.mapshaper.undoTest;
  });
  await page.locator('#import-options .cancel-btn').click();
  await page.locator('.sidebar-tab.layer-tab').click();
  await page.locator('.new-layer-links .layer-menu-link[data-kind="labels"]').click();
  await expect.poll(function() {
    return page.evaluate(function() {
      return window.mapshaper.undoTest.getInteractionMode();
    });
  }).toBe('label');
  expect(await getBodyClasses(page)).toContain('layers-open');
});

function getBodyClasses(page) {
  return page.evaluate(function() {
    return document.body.className.split(' ');
  });
}
