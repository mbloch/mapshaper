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

test('a circle colour is set from the field, and its opacity beside it', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await clickButton(page, 'Create simple circles');
  var fill = colorRow(page, 'Fill');

  await setField(fill.locator('.label-color-input'), '#3366cc');
  await setField(fill.locator('.label-opacity-input'), '50%');
  await setField(colorRow(page, 'Stroke').locator('.label-color-input'), '#ff0000');

  expect(await getStyleValue(page, 'fill')).toBe('#3366cc');
  expect(await getStyleValue(page, 'fill-opacity')).toBe(0.5);
  expect(await getStyleValue(page, 'stroke')).toBe('#ff0000');
  expect(errors).toEqual([]);
});

test('a circle opacity is blank with no colour, and 100% with one', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await clickButton(page, 'Create simple circles');
  var fill = colorRow(page, 'Fill');
  var stroke = colorRow(page, 'Stroke');
  // created with a fill and no stroke, and no opacity stored for either
  expect(await getStyleValue(page, 'fill-opacity')).toBeUndefined();
  await expect(fill.locator('.label-opacity-input')).toHaveValue('100%');
  await expect(stroke.locator('.label-opacity-input')).toHaveValue('');

  // a change elsewhere does not write the opacity being shown as the default
  await setField(sizeField(page, 'Radius'), '6');
  expect(await getStyleValue(page, 'fill-opacity')).toBeUndefined();
  expect(await getStyleValue(page, 'stroke-opacity')).toBeUndefined();

  await setField(stroke.locator('.label-color-input'), '#ff0000');
  await expect(stroke.locator('.label-opacity-input')).toHaveValue('100%');
  expect(await getStyleValue(page, 'stroke-opacity')).toBeUndefined();
  expect(errors).toEqual([]);
});

test('the label field menu stays open when clicked', async function({page}) {
  // The panel lets go of focus after a click, which closes a native menu the
  // moment it opens unless the click on the menu itself is left alone.
  await loadFixture(page, FIXTURE);
  var menu = page.locator('.point-style-panel .label-style-row select').first();
  var box = await menu.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(250);
  expect(await page.evaluate(function() {
    return document.activeElement && document.activeElement.nodeName;
  })).toBe('SELECT');
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

// The colour row with the caption @label, wherever the panel puts it.
function colorRow(page, label) {
  return page.locator('.point-style-panel .label-split-row').filter({
    has: page.locator('.label-split-cell > span', {hasText: new RegExp('^' + label + '$')})
  });
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
