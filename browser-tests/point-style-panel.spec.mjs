import { expect, test } from '@playwright/test';

var FIXTURE = 'test/data/features/join/ex3_pointB.json';
var LAYER = 'ex3_pointB';

test('a circle is sized from its radius and stroke width fields', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await runCommand(page, '-style r=3 fill=#000000 stroke-width=0');
  await expect(page.locator('.point-style-panel .label-style-panel-title')).toContainText('Circle styles');
  expect(await getStyleValue(page, 'r')).toBe(3);
  var radius = sizeField(page, 'Radius');
  var strokeWidth = sizeField(page, 'Width');

  await setField(radius, '8');
  expect(await getStyleValue(page, 'r')).toBe(8);

  await setField(strokeWidth, '0.75'); // kept to the quarter
  expect(await getStyleValue(page, 'stroke-width')).toBe(0.75);

  // the ladder of widths, walked from the keyboard
  await strokeWidth.press('ArrowUp');
  await page.waitForTimeout(250);
  expect(await getStyleValue(page, 'stroke-width')).toBe(1);
  expect(errors).toEqual([]);
});

test('an expression turns a field into labels, and the label tool takes over', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  var btn = page.locator('.point-style-panel .label-panel-action-btn').filter({hasText: 'Create'}).first();

  await page.locator('.point-style-panel .label-create-expression-row input').fill('d.id');
  await btn.click();
  await page.waitForTimeout(400);
  expect(await getStyleValue(page, 'label-text')).toBe('A');
  // the layer is a label layer now, which this panel can only restyle
  expect(await getInteractionMode(page)).toBe('label');
  expect(errors).toEqual([]);
});

test('"as new layer" makes a labeled copy and leaves the points alone', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  var btn = page.locator('.point-style-panel .label-panel-action-btn').filter({hasText: 'Create'}).first();

  await page.locator('.point-style-panel .label-create-expression-row input').fill('d.id');
  await page.locator('.point-style-panel .point-create-copy-label input').check();
  await btn.click();
  await page.waitForTimeout(400);
  expect(await getStyleValue(page, 'label-text')).toBeUndefined();
  expect(await page.evaluate(function() {
    var lyr = window.mapshaper.undoTest.getLayerInfo('labels');
    return lyr && lyr.records[0]['label-text'];
  })).toBe('A');
  expect(errors).toEqual([]);
});

test('a layer of plain points has one point mode in the arrow menu', async function({page}) {
  await loadFixture(page, FIXTURE);
  await page.evaluate(function() { window.mapshaper.undoTest.setInteractionMode('off'); });
  await page.locator('.pointer-btn').hover();
  await page.locator('.nav-sub-menu .nav-menu-item').first().waitFor();
  var items = await page.locator('.nav-sub-menu .nav-menu-item').allInnerTexts();
  expect(items.filter(function(s) { return s == 'style/edit points'; }).length).toBe(1);
  expect(items).not.toContain('style/edit symbols');
});

test('Convert to symbols gives every point the default symbol and opens the symbol tool', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await clickButton(page, 'Convert to symbols');
  await expect.poll(function() { return getInteractionMode(page); }).toBe('symbols');
  var records = await getRecords(page);
  expect(records.map(function(rec) { return rec.r; })).toEqual([5, 5, 5]);
  expect(await getSessionHistory(page)).toContain('-symbols type=circle radius=5 fill=#333333');
  expect(errors).toEqual([]);
});

test("the panel's close button hides the panel and leaves the point mode on", async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  var panel = page.locator('.point-style-panel');
  await panel.locator('.label-style-close').click();
  await expect(panel).toBeHidden();
  expect(await getInteractionMode(page)).toBe('point_style');
  await page.locator('.point-toolbar .floating-toolbar-btn[data-tooltip$="style panel"]').click();
  await expect(panel).toBeVisible();
  await page.locator('.point-toolbar .floating-toolbar-btn', {hasText: 'Done'}).click();
  expect(await getInteractionMode(page)).not.toBe('point_style');
  expect(errors).toEqual([]);
});

test('points with no symbol in a layer of symbols are drawn as markers', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await runCommand(page, '-style icon=star icon-size=10 ids=0');
  await page.evaluate(function() { window.mapshaper.undoTest.setInteractionMode('symbols'); });
  await expect(page.locator('.mapshaper-svg-symbol.unstyled-point-marker')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('points are added, moved and deleted with commands', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  var box = await page.locator('.map-layers').boundingBox();

  expect(await page.evaluate(function() {
    return window.mapshaper.undoTest.getToolMode();
  })).toBe('edit_points');

  // moved by dragging
  var p = (await getPointPixels(page))[1];
  await page.mouse.move(box.x + p[0] - 5, box.y + p[1]);
  await page.mouse.move(box.x + p[0], box.y + p[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + p[0] + 30, box.y + p[1] + 20, {steps: 5});
  await page.mouse.up();
  await expect.poll(function() { return getSessionHistory(page); }).toContain('-update-point ids=1');

  // added by a click on empty map
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.5);
  await expect.poll(async function() { return (await getRecords(page)).length; }).toBe(4);
  expect(await getSessionHistory(page)).toContain('-add-shape coordinates=');

  // a click on a point neither adds one nor selects it
  p = (await getPointPixels(page))[2];
  await page.mouse.move(box.x + p[0] - 5, box.y + p[1]);
  await page.mouse.click(box.x + p[0], box.y + p[1]);
  await page.waitForTimeout(150);
  expect((await getRecords(page)).length).toBe(4);
  expect(await page.evaluate(function() {
    return window.mapshaper.undoTest.getSelectionIds();
  })).toEqual([]);

  // deleted from the context menu
  await page.mouse.click(box.x + p[0], box.y + p[1], {button: 'right'});
  await page.locator('.contextmenu-item').filter({hasText: 'delete point'}).click();
  await expect.poll(async function() { return (await getRecords(page)).length; }).toBe(3);
  expect(await getSessionHistory(page)).toContain('-filter');
  expect(errors).toEqual([]);
});

async function runCommand(page, cmd) {
  await page.evaluate(function(cmd) {
    return window.mapshaper.undoTest.runCommand(cmd);
  }, cmd);
  await page.waitForTimeout(250);
}

async function getRecords(page) {
  return page.evaluate(function(name) {
    return window.mapshaper.undoTest.getLayerInfo(name).records;
  }, LAYER);
}

async function getPointPixels(page) {
  return page.evaluate(function(name) {
    return window.mapshaper.undoTest.getLayerPointPixels(name);
  }, LAYER);
}

async function getSessionHistory(page) {
  return JSON.stringify(await page.evaluate(function() {
    return window.mapshaper.undoTest.getSessionHistory();
  }));
}

async function clickButton(page, label) {
  await page.locator('.point-style-panel .label-panel-action-btn')
    .filter({hasText: label}).click();
  await page.waitForTimeout(400);
}

// By its label, so that rearranging the panel does not quietly point a test at
// the wrong field.
function sizeField(page, label) {
  return page.locator('.point-style-panel .label-split-cell')
    .filter({hasText: label}).locator('.size-field-input');
}

async function setField(locator, value) {
  await locator.fill(value);
  await locator.press('Enter');
  await locator.page().waitForTimeout(250);
}

async function getInteractionMode(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getInteractionMode();
  });
}

async function getStyleValue(page, field) {
  return page.evaluate(function(o) {
    var lyr = window.mapshaper.undoTest.getLayerInfo(o.layer);
    return lyr && lyr.records[0] && lyr.records[0][o.field];
  }, {layer: LAYER, field: field});
}

async function loadFixture(page, fixture) {
  await page.goto('/?undo=on&undo-test=on&files=' + encodeURIComponent(fixture));
  await page.waitForFunction(function() {
    return window.mapshaper && window.mapshaper.undoTest;
  });
  await page.waitForFunction(function() {
    return window.mapshaper.undoTest.getState().model.datasetCount > 0;
  });
  await page.evaluate(function() {
    window.mapshaper.undoTest.clearUndoHistory();
    window.mapshaper.undoTest.setInteractionMode('point_style');
  });
  await page.locator('.point-style-panel').waitFor({state: 'visible'});
}

function collectPageErrors(page) {
  var errors = [];
  page.on('pageerror', function(err) {
    errors.push(String(err.message || err));
  });
  return errors;
}
