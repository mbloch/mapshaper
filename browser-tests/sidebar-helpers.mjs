// The layers panel opens by itself beside the first data imported (see
// showLayersForFirstData() in src/gui/gui.mjs). Every Layers button toggles
// the panel, so a test that clicks one to open the panel would close it.

// Opens the layers panel if it is not open already. Gives the panel a moment
// to open by itself first: it opens once the import dialog has closed, which
// can be just after a test sees its data arrive.
export async function openLayersPanel(page) {
  if (await layersPanelOpensWithin(page, 1500)) return;
  await page.locator('.layer-control-btn .active-layer-label').click();
  await page.locator('body.layers-open').waitFor();
}

// Closes the sidebar that opened beside the imported data, for tests that
// place points and drags relative to a map that fills the window.
export async function closeSidebarAfterImport(page) {
  if (!(await layersPanelOpensWithin(page, 5000))) return;
  await page.locator('.sidebar-hide-btn').click();
  await page.waitForFunction(function() {
    return !document.body.classList.contains('sidebar-open');
  });
}

// Clicks the layer panel link that creates a layer of a kind ('labels',
// 'symbols', 'points', 'lines' or 'polygons'), with the panel already open.
// "Add labels" is in the row of links; the others are in the menu opened from
// "Draw".
export async function clickAddLayerLink(page, kind) {
  var link = page.locator('.layer-add-links .layer-menu-link[data-kind="' + kind + '"]:visible');
  if (await link.count() === 0) {
    await page.locator('.draw-menu-btn').click();
    link = page.locator('.draw-menu .draw-menu-item[data-kind="' + kind + '"]');
  }
  await link.click();
}

async function layersPanelOpensWithin(page, ms) {
  return page.locator('body.layers-open').waitFor({timeout: ms})
    .then(function() { return true; }, function() { return false; });
}
