import { expect, test } from '@playwright/test';

var FIXTURE = 'test/data/features/join/ex3_pointB.json';
var LAYER = 'ex3_pointB';

test('a circle is sized from its radius and stroke width fields', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await clickButton(page, 'Create simple circles');
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
