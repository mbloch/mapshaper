import { expect, test } from '@playwright/test';

// A selection made in one tool stays selected in the next, as far as the next
// tool can select those features (see src/gui/gui-selection-carry.mjs).

var FIXTURE = 'test/data/features/join/ex3_pointB.json';
var LAYER = 'ex3_pointB';

test('features selected with the selection tool are styled in the point panel', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page);
  await runCommand(page, '-style r=6');
  await setMode(page, 'selection');
  await clickPoint(page, 0);
  await clickPoint(page, 1);
  expect(await getSelectionIds(page)).toEqual([0, 1]);
  await expect(page.locator('.selection-tool-options')).toBeVisible();

  await setMode(page, 'point_style');
  expect(await getSelectionIds(page)).toEqual([0, 1]);
  await expect(page.locator('.point-style-panel .label-editing-status')).toHaveText('Editing: 2 selected');
  var fill = page.locator('.point-style-panel .label-split-row').filter({
    has: page.locator('.label-split-cell > span', {hasText: /^Fill$/})
  }).locator('.label-color-input');
  await fill.fill('#ff0000');
  await fill.press('Enter');
  await expect.poll(function() { return getFills(page); })
    .toEqual(['#ff0000', '#ff0000', undefined]);

  // inspect pins one of them
  await setMode(page, 'info');
  expect([0, 1]).toContain(await getHitId(page));

  // a tool that does not select drops the selection
  await setMode(page, 'ruler');
  await setMode(page, 'selection');
  expect(await getSelectionIds(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('plain points do not take a selection into the point tool', async function({page}) {
  // a click there adds a point, and Delete would remove a selection unseen
  await loadFixture(page);
  await setMode(page, 'selection');
  await selectAllByBox(page);
  expect(await getSelectionIds(page)).toEqual([0, 1, 2]);
  await setMode(page, 'point_style');
  expect(await getSelectionIds(page)).toEqual([]);
});

test('the label and symbol tools keep only the features they edit', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page);
  // A and C are text labels, B is a numbered marker
  await runCommand(page, '-each "d = this.properties; d[\'label-text\'] = id; ' +
    'if (id == \'B\') {d[\'label-pos\'] = \'c\'; d.icon = \'circle\'}"');
  await setMode(page, 'selection');
  await selectAllByBox(page);
  expect(await getSelectionIds(page)).toEqual([0, 1, 2]);

  await setMode(page, 'label');
  expect(await getSelectionIds(page)).toEqual([0, 2]);
  await expect(page.locator('.label-cue-selected')).toHaveCount(2);

  await setMode(page, 'selection');
  expect(await getSelectionIds(page)).toEqual([0, 2]);
  await selectAllByBox(page);
  await setMode(page, 'symbols');
  expect(await getSelectionIds(page)).toEqual([1]);
  expect(errors).toEqual([]);
});

async function loadFixture(page) {
  await page.goto('/?undo=on&undo-test=on&files=' + encodeURIComponent(FIXTURE));
  await page.waitForFunction(function() {
    return window.mapshaper && window.mapshaper.undoTest &&
      window.mapshaper.undoTest.getState().model.datasetCount > 0;
  });
  await page.evaluate(function() {
    window.mapshaper.undoTest.clearUndoHistory();
    // the points are at the edges of the data's extent
    window.mapshaper.undoTest.zoomByPct(0.5);
  });
  await page.waitForTimeout(150);
}

async function setMode(page, mode) {
  await page.evaluate(function(mode) {
    window.mapshaper.undoTest.setInteractionMode(mode);
  }, mode);
  await page.waitForTimeout(150);
}

async function runCommand(page, str) {
  await page.evaluate(function(cmd) {
    return window.mapshaper.undoTest.runCommand(cmd);
  }, str);
  await page.waitForTimeout(250);
}

async function getSelectionIds(page) {
  var ids = await page.evaluate(function() {
    return window.mapshaper.undoTest.getSelectionIds();
  });
  return ids.sort(function(a, b) { return a - b; });
}

async function getHitId(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getHitId();
  });
}

async function getFills(page) {
  return page.evaluate(function(name) {
    return window.mapshaper.undoTest.getLayerInfo(name).records.map(function(rec) {
      return rec.fill;
    });
  }, LAYER);
}

async function clickPoint(page, id) {
  var box = await page.locator('.mshp-main-map').boundingBox();
  var p = (await page.evaluate(function(name) {
    return window.mapshaper.undoTest.getLayerPointPixels(name);
  }, LAYER))[id];
  // the hit control finds the feature under the pointer on hover
  await page.mouse.move(box.x + p[0] - 10, box.y + p[1]);
  await page.mouse.move(box.x + p[0], box.y + p[1], {steps: 3});
  await page.mouse.click(box.x + p[0], box.y + p[1]);
  await page.waitForTimeout(150);
}

// shift-drag a box over the whole map
async function selectAllByBox(page) {
  var box = await page.locator('.mshp-main-map').boundingBox();
  await page.keyboard.down('Shift');
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {steps: 5});
  await page.mouse.move(box.x + box.width - 20, box.y + box.height - 20, {steps: 5});
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await page.waitForTimeout(200);
}

function collectPageErrors(page) {
  var errors = [];
  page.on('pageerror', function(err) {
    errors.push(String(err.message || err));
  });
  return errors;
}
